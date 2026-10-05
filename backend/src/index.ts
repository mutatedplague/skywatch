import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import { type Config, env } from './config.js';
import { distanceNm } from './geo.js';
import { describePosition, GeocodeError, geocodeEnabled, searchAddress } from './geocode.js';
import { runtime } from './runtime.js';
import { currentSite, onSiteChange, parsePatch, resetSite, SiteError, updateSite } from './site.js';
import { RateLimitedError } from './sources/http.js';
import { type AdsbSource, createSource } from './sources/index.js';
import { Tracker } from './tracker.js';
import type { Aircraft, FeedStats, SiteConfig, Snapshot, SourceProbe } from './types.js';

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
    address: currentSite().address,
    addressLookup: env.allowSiteEdit && geocodeEnabled(),
    requestedSource: currentSite().source ?? env.requestedSource,
    sourceFrom: currentSite().source ? 'console' : 'env',
    dump1090Url: runtime.dump1090Url,
    openskyClientId: runtime.openskyClientId,
    openskyHasSecret: runtime.openskyClientSecret !== '',
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

/**
 * Try a feed before committing to it: one fetch with the settings the console
 * is about to save, laid over whatever is live. The setup wizard uses it to
 * say "found 23 aircraft" rather than asking the operator to trust a form.
 */
app.post('/api/source/test', async (request, reply) => {
  if (!env.allowSiteEdit) {
    return reply.code(403).send({ error: 'site editing is disabled (ALLOW_SITE_EDIT=false)' });
  }
  const body = (request.body ?? {}) as Record<string, unknown>;
  let probe: Config;
  try {
    const patch = parsePatch(body);
    // Spreading the runtime reads every getter once, giving a plain snapshot
    // that the patch can be laid over without touching the live config.
    const live = { ...runtime };
    const source = patch.source ?? currentSite().source ?? env.requestedSource;
    probe = {
      ...live,
      lat: patch.lat ?? live.lat,
      lon: patch.lon ?? live.lon,
      rangeNm: patch.rangeNm ?? live.rangeNm,
      source,
      simulated: source === 'demo',
      dump1090Url: patch.dump1090Url ?? live.dump1090Url,
      openskyClientId: patch.openskyClientId ?? live.openskyClientId,
      openskyClientSecret: patch.openskyClientSecret ?? live.openskyClientSecret,
    };
  } catch (error) {
    if (error instanceof SiteError) return reply.code(400).send({ error: error.message });
    throw error;
  }

  const startedAt = Date.now();
  const adapter = createSource(probe);
  const result: SourceProbe = {
    ok: false,
    source: probe.source,
    label: adapter.label,
    aircraft: 0,
    inRange: 0,
    latencyMs: 0,
    error: null,
  };
  try {
    const fetched = await adapter.fetchAircraft();
    result.ok = true;
    result.aircraft = fetched.aircraft.length;
    result.inRange = fetched.aircraft.filter(
      (a) => distanceNm(probe.lat, probe.lon, a.lat, a.lon) <= probe.rangeNm,
    ).length;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  result.latencyMs = Date.now() - startedAt;
  return result;
});

/**
 * Turn an address into a position for the site form, or a position into an
 * address to caption one taken from the browser. Proxied through the receiver
 * so the geocoder sees one well-behaved client rather than every browser.
 */
app.get('/api/geocode', async (request, reply) => {
  if (!env.allowSiteEdit || !geocodeEnabled()) {
    return reply.code(404).send({ error: 'address lookup is disabled' });
  }
  const query = request.query as { q?: unknown; lat?: unknown; lon?: unknown };
  try {
    if (typeof query.q === 'string') {
      return { results: await searchAddress(query.q) };
    }
    if (typeof query.lat === 'string' && typeof query.lon === 'string') {
      const lat = Number(query.lat);
      const lon = Number(query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return reply.code(400).send({ error: 'lat and lon must be decimal degrees' });
      }
      const hit = await describePosition(lat, lon);
      return { results: hit ? [hit] : [] };
    }
    return reply.code(400).send({ error: 'give q, or lat and lon' });
  } catch (error) {
    if (error instanceof GeocodeError) {
      if (error.status >= 500) request.log.warn({ err: error.message }, 'geocode failed');
      return reply.code(error.status).send({ error: error.message });
    }
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
  // A different feed has its own patience; what the old one taught us no longer applies.
  throttleMs = 0;
  calmPolls = 0;
  app.log.info(
    {
      site: site.site,
      position: site.lat === null ? 'unset' : `${site.lat.toFixed(4)}, ${site.lon?.toFixed(4)}`,
      positionSource: site.positionSource,
      address: site.address ?? undefined,
      source: runtime.source,
      label: source.label,
    },
    'site updated',
  );
  broadcast();
});

let consecutiveFailures = 0;
let pollTimer: NodeJS.Timeout | undefined;
let stopped = false;

/**
 * Extra time added to every poll after a feed answers 429. The community
 * networks publish a limit but enforce a stricter one in bursts, so rather
 * than hammer them at the published rate the loop learns how fast it is
 * really allowed to go: double the margin on each 429, and ease it back after
 * a run of clean polls.
 */
let throttleMs = 0;
let calmPolls = 0;
const THROTTLE_MIN_MS = 1000;
const THROTTLE_MAX_MS = 15_000;
const THROTTLE_RELAX_AFTER = 30;

async function poll() {
  const startedAt = Date.now();
  let rateLimited: RateLimitedError | null = null;
  try {
    const result = await source.fetchAircraft();
    latest = tracker.update(result.aircraft, Date.now());

    consecutiveFailures = 0;
    if (throttleMs > 0 && ++calmPolls >= THROTTLE_RELAX_AFTER) {
      throttleMs = throttleMs > THROTTLE_MIN_MS ? Math.floor(throttleMs * 0.8) : 0;
      calmPolls = 0;
    }
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
    if (error instanceof RateLimitedError) {
      rateLimited = error;
      throttleMs = Math.min(THROTTLE_MAX_MS, Math.max(THROTTLE_MIN_MS, throttleMs * 2));
      calmPolls = 0;
      app.log.warn(
        { err: message, pollMs: runtime.pollMs + throttleMs },
        'feed is rate limiting, polling slower',
      );
    } else if (consecutiveFailures === 1 || consecutiveFailures % 10 === 0) {
      // Log the first failure loudly, then stay quiet while backing off.
      app.log.error({ err: message, attempt: consecutiveFailures }, 'feed poll failed');
    }
    // Keep serving the last good picture; the tracker ages it out on its own.
    latest = tracker.update([], Date.now());
  }

  broadcast();

  if (stopped) return;
  const interval = runtime.pollMs + throttleMs;
  let delay: number;
  if (rateLimited) {
    // A 429 is not an outage: wait what was asked, or one stretched interval.
    delay = Math.max(rateLimited.retryAfterMs ?? 0, interval);
  } else if (consecutiveFailures === 0) {
    delay = interval;
  } else {
    // Exponential backoff on failure, capped at 30s, so a dead feed stays cheap.
    delay = Math.min(30_000, interval * 2 ** Math.min(6, consecutiveFailures));
  }
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
