import type { RawAircraft } from '../types.js';

/**
 * dump1090-fa, readsb, tar1090, adsb.lol and airplanes.live all serve the same
 * aircraft record shape, so one normaliser covers every one of them.
 */

type Json = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeReadsb(raw: Json): RawAircraft | null {
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (lat === null || lon === null) return null;

  // TIS-B / MLAT targets are prefixed with ~ upstream; strip it for a stable key.
  const hex = String(raw.hex ?? raw.icao ?? '')
    .toLowerCase()
    .replace(/^~/, '')
    .trim();
  if (!hex) return null;

  const altBaro = raw.alt_baro ?? raw.altitude;
  const onGround = altBaro === 'ground';

  // dbFlags is a bitfield from the readsb aircraft database; bit 0 marks military.
  const dbFlags = num(raw.dbFlags) ?? 0;

  return {
    hex,
    flight: str(raw.flight),
    registration: str(raw.r),
    type: str(raw.t),
    lat,
    lon,
    altitude: onGround ? 0 : num(altBaro),
    altitudeGeom: num(raw.alt_geom),
    groundSpeed: num(raw.gs),
    track: num(raw.track) ?? num(raw.true_heading) ?? num(raw.mag_heading),
    verticalRate: num(raw.baro_rate) ?? num(raw.geom_rate),
    squawk: str(raw.squawk),
    category: str(raw.category),
    onGround,
    rssi: num(raw.rssi),
    seen: num(raw.seen) ?? 0,
    military: (dbFlags & 1) === 1,
  };
}

/** Pulls the aircraft array out of whichever key the upstream feed happens to use. */
export function extractAircraftArray(payload: unknown): Json[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as Json;
  const list = body.ac ?? body.aircraft ?? body.states;
  return Array.isArray(list) ? (list.filter((x) => x && typeof x === 'object') as Json[]) : [];
}

export function normalizeMany(payload: unknown): RawAircraft[] {
  const out: RawAircraft[] = [];
  for (const entry of extractAircraftArray(payload)) {
    const normalized = normalizeReadsb(entry);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Message counter, where the feed exposes one. */
export function extractMessageCount(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const messages = (payload as Json).messages;
  return typeof messages === 'number' ? messages : null;
}
