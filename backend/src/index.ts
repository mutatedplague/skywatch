import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import { config } from './config.js';
import { createSource } from './sources/index.js';
import { Tracker } from './tracker.js';
import type { Aircraft, FeedStats, SiteConfig, Snapshot } from './types.js';

const source = createSource(config);
const tracker = new Tracker(config);

const siteConfig: SiteConfig = {
  site: config.site,
  lat: config.lat,
  lon: config.lon,
  rangeNm: config.rangeNm,
  source: config.source,
  sourceLabel: source.label,
  simulated: config.simulated,
  alertRadiusNm: config.alertRadiusNm,
  alertAltitudeFt: config.alertAltitudeFt,
  pollMs: config.pollMs,
};

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

await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') });
await app.register(websocket);

const clients = new Set<import('ws').WebSocket>();

app.get('/api/health', async () => ({
  ok: true,
  source: config.source,
  sourceOk: stats.sourceOk,
  tracked: stats.tracked,
  lastUpdate: stats.lastUpdate,
  uptimeSeconds: Math.round(process.uptime()),
}));

app.get('/api/config', async () => siteConfig);

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
      ? config.pollMs
      : Math.min(30_000, config.pollMs * 2 ** Math.min(6, consecutiveFailures));
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

await app.listen({ port: config.port, host: config.host });

app.log.info(
  {
    source: config.source,
    label: source.label,
    site: `${config.lat.toFixed(4)}, ${config.lon.toFixed(4)}`,
    rangeNm: config.rangeNm,
    pollMs: config.pollMs,
  },
  'SKYWATCH receiver online',
);

void poll();
