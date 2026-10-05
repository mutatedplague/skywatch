import { env } from './config.js';
import { fetchJson } from './sources/http.js';

/** One place the geocoder matched, ready to drop into the site form. */
export interface GeocodeHit {
  label: string;
  lat: number;
  lon: number;
}

export class GeocodeError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/**
 * Nominatim's usage policy allows one request a second from any one client,
 * so every lookup goes through a single queue that spaces them out. Answers
 * are kept for a while: the console asks the same question again whenever the
 * form is reopened.
 */
const MIN_GAP_MS = 1100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const MAX_QUERY_LENGTH = 200;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, { at: number; hits: GeocodeHit[] }>();

export function geocodeEnabled(): boolean {
  return env.geocodeUrl !== null;
}

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  // A failed lookup must not wedge the queue for the next one.
  queue = run.catch(() => undefined);
  return run;
}

function recall(key: string): GeocodeHit[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.hits;
}

function remember(key: string, hits: GeocodeHit[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), hits });
}

interface NominatimPlace {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
}

function toHit(place: unknown): GeocodeHit | null {
  if (place === null || typeof place !== 'object') return null;
  const { lat, lon, display_name: label } = place as NominatimPlace;
  const parsedLat = Number(lat);
  const parsedLon = Number(lon);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) return null;
  if (typeof label !== 'string' || label.trim() === '') return null;
  return { label: label.trim(), lat: parsedLat, lon: parsedLon };
}

async function request(path: string, params: Record<string, string>): Promise<unknown> {
  if (env.geocodeUrl === null) throw new GeocodeError('address lookup is disabled', 404);
  const url = new URL(`${env.geocodeUrl.replace(/\/+$/, '')}/${path}`);
  url.search = new URLSearchParams({ format: 'jsonv2', ...params }).toString();
  try {
    return await throttled(() => fetchJson(url.toString(), { headers: { 'accept-language': 'en' } }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeocodeError('the address service did not answer in time', 504);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new GeocodeError(`address lookup failed: ${message}`, 502);
  }
}

/** Free-text search: a street address, a town, a postcode, a landmark. */
export async function searchAddress(query: string): Promise<GeocodeHit[]> {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 3) throw new GeocodeError('type at least three characters', 400);
  if (q.length > MAX_QUERY_LENGTH) throw new GeocodeError('that address is too long', 400);

  const key = `q:${q.toLowerCase()}`;
  const cached = recall(key);
  if (cached) return cached;

  const payload = await request('search', { q, limit: '5' });
  // A building and the station inside it come back as two places with one
  // name; the operator only needs to see it once.
  const seen = new Set<string>();
  const hits: GeocodeHit[] = [];
  for (const place of Array.isArray(payload) ? payload : []) {
    const hit = toHit(place);
    if (hit && !seen.has(hit.label)) {
      seen.add(hit.label);
      hits.push(hit);
    }
  }
  remember(key, hits);
  return hits;
}

/** The nearest address to a position, for labelling one taken from the browser. */
export async function describePosition(lat: number, lon: number): Promise<GeocodeHit | null> {
  const key = `r:${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = recall(key);
  if (cached) return cached[0] ?? null;

  // Nominatim answers a position it cannot name with 200 and an `error` field,
  // which toHit treats like any other non-place.
  const payload = await request('reverse', { lat: String(lat), lon: String(lon), zoom: '18' });
  const hit = toHit(payload);
  remember(key, hit ? [hit] : []);
  return hit;
}
