import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import { env } from './config.js';
import { runtime } from './runtime.js';
import { currentSite, onSiteChange, resetSite, SiteError, updateSite } from './site.js';
import { type AdsbSource, createSource } from './sources/index.js';
import { Tracker } from './tracker.js';
import type { Aircraft, FeedStats, SiteConfig, Snapshot } from './types.js';

// Both are rebuilt when the site moves: the community adapters bake the
// position into their request URL, and every track's geometry is measured from
// the old origin.
let source: AdsbSource = createSource(runtime);
let tracker = new Tracker(runtime);

function describeSite(): SiteConfig {
  return {
    site: runtime.site,
    lat: runtime.lat,
    lon: runtime.lon,
    rangeNm: runtime.rangeNm,
    source: runtime.source,
    sourceLabel: source.label,
    simulated: runtime.simulated,
    alertRadiusNm: runtime.alertRadiusNm,
    alertAltitudeFt: runtime.alertAltitudeFt,
    pollMs: runtime.pollMs,
    positionSource: currentSite().positionSource,
    siteEditable: env.allowSiteEdit,
  };
}

let siteConfig: SiteConfig = describeSite();

let stats: FeedStats = {
  tracked: 0,
  overhead: 0,
  closestNm: null,
  messages: 0,
  sourceOk: false,
  lastUpdate: 0,
  latencyMs: 0,
  error: null,
};
let latest: Aircraft[] = [];

function buildSnapshot(): Snapshot {
  return { now: Date.now(), aircraft: latest, stats, config: siteConfig };
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: undefined,
  },
});

await app.register(cors, { origin: runtime.corsOrigin === '*' ? true : runtime.corsOrigin.split(',') });
await app.register(websocket);

const clients = new Set<import('ws').WebSocket>();

app.get('/api/health', async () => ({
  ok: true,
  source: runtime.source,
  sourceOk: stats.sourceOk,
  tracked: stats.tracked,
  lastUpdate: stats.lastUpdate,
  uptimeSeconds: Math.round(process.uptime()),
}));

app.get('/api/config', async () => siteConfig);

/**
 * Move the site from the console. The reply is the new config, and every
 * connected scope is pushed a fresh frame immediately rather than waiting for
 * the next poll, so the rings redraw as soon as the form is saved.
 */
app.post('/api/site', async (request, reply) => {
  if (!env.allowSiteEdit) {
    return reply.code(403).send({ error: 'site editing is disabled (ALLOW_SITE_EDIT=false)' });
  }
  const body = (request.body ?? {}) as Record<string, unknown>;
  try {
    const site = body.reset === true ? resetSite() : updateSite(body);
    return { ok: true, config: siteConfig, site };
  } catch (error) {
    if (error instanceof SiteError) return reply.code(400).send({ error: error.message });
    throw error;
  }
});

app.get('/api/aircraft', async () => buildSnapshot());

app.get('/ws', { websocket: true }, (connection) => {
  // @fastify/websocket v11 hands the socket directly; v10 wrapped it in `.socket`.
  const socket = ((connection as unknown as { socket?: import('ws').WebSocket }).socket ??
    connection) as import('ws').WebSocket;

  clients.add(socket);
  app.log.debug({ clients: clients.size }, 'scope connected');

  try {
    socket.send(JSON.stringify(buildSnapshot()));
  } catch {
    // Client hung up mid-handshake; the close handler cleans up.
  }

  socket.on('close', () => {
    clients.delete(socket);
    app.log.debug({ clients: clients.size }, 'scope disconnected');
  });
  socket.on('error', () => clients.delete(socket));
});

function broadcast() {
  if (clients.size === 0) return;
  const payload = JSON.stringify(buildSnapshot());
  for (const socket of clients) {
    // 1 === WebSocket.OPEN
    if (socket.readyState === 1) {
      socket.send(payload);
    } else {
      clients.delete(socket);
    }
  }
}

/**
 * The site moved. Every existing track's range and bearing were measured from
 * the old origin, and the community adapters hold a URL built around it, so
 * both are discarded rather than left to drift. The next poll refills the
 * picture within pollMs.
 */
onSiteChange((site) => {
  source = createSource(runtime);
  tracker = new Tracker(runtime);
  latest = [];
  siteConfig = describeSite();
  stats = { ...stats, tracked: 0, overhead: 0, closestNm: null, sourceOk: false, error: null };
  app.log.info(
    {
      site: site.site,
      position: site.lat === null ? 'unset' : `${site.lat.toFixed(4)}, ${site.lon?.toFixed(4)}`,
      positionSource: site.positionSource,
      source: runtime.source,
    },
    'site updated',
  );
  broadcast();
});

let consecutiveFailures = 0;
let pollTimer: NodeJS.Timeout | undefined;
let stopped = false;

async function poll() {
  const startedAt = Date.now();
  try {
    const result = await source.fetchAircraft();
    latest = tracker.update(result.aircraft, Date.now());

    consecutiveFailures = 0;
    stats = {
      tracked: latest.length,
      overhead: latest.filter((a) => a.overhead).length,
      closestNm: latest.length > 0 ? (latest[0] as Aircraft).distanceNm : null,
      messages: result.messages ?? stats.messages + result.aircraft.length,
      sourceOk: true,
      lastUpdate: Date.now(),
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    consecutiveFailures += 1;
    const message = error instanceof Error ? error.message : String(error);
    stats = { ...stats, sourceOk: false, latencyMs: Date.now() - startedAt, error: message };
    // Log the first failure loudly, then stay quiet while backing off.
    if (consecutiveFailures === 1 || consecutiveFailures % 10 === 0) {
      app.log.error({ err: message, attempt: consecutiveFailures }, 'feed poll failed');
    }
    // Keep serving the last good picture; the tracker ages it out on its own.
    latest = tracker.update([], Date.now());
  }

  broadcast();

  if (stopped) return;
  // Exponential backoff on failure, capped at 30s, so a dead feed stays cheap.
  const delay =
    consecutiveFailures === 0
      ? runtime.pollMs
      : Math.min(30_000, runtime.pollMs * 2 ** Math.min(6, consecutiveFailures));
  pollTimer = setTimeout(poll, delay);
}

async function shutdown(signal: string) {
  if (stopped) return;
  stopped = true;
  app.log.info({ signal }, 'shutting down');
  if (pollTimer) clearTimeout(pollTimer);
  for (const socket of clients) socket.close(1001, 'server shutting down');
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: runtime.port, host: runtime.host });

app.log.info(
  {
    source: runtime.source,
    label: source.label,
    site: `${runtime.lat.toFixed(4)}, ${runtime.lon.toFixed(4)}`,
    positionSource: currentSite().positionSource,
    rangeNm: runtime.rangeNm,
    pollMs: runtime.pollMs,
  },
  'SKYWATCH receiver online',
);

void poll();
