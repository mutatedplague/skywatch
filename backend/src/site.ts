import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { env } from './config.js';

/** Where the position currently in force came from. */
export type PositionSource = 'env' | 'console' | 'none';

export interface Site {
  /** null until a position is known from either the environment or the console. */
  lat: number | null;
  lon: number | null;
  site: string;
  rangeNm: number;
  alertRadiusNm: number;
  alertAltitudeFt: number;
  positionSource: PositionSource;
}

/** The shape persisted to disk. Every field is optional: the console may save
 *  an alert volume without ever touching the position, or the other way round. */
interface StoredSite {
  lat?: number | null;
  lon?: number | null;
  site?: string | null;
  rangeNm?: number | null;
  alertRadiusNm?: number | null;
  alertAltitudeFt?: number | null;
}

/** Bounds the console is held to. The receiver is the authority, not the form. */
const LIMITS = {
  rangeNm: { min: 5, max: 250 },
  alertRadiusNm: { min: 0.25, max: 250 },
  alertAltitudeFt: { min: 500, max: 60000 },
} as const;

const STATE_FILE = resolve(env.stateDir, 'site.json');
const MAX_NAME_LENGTH = 24;

export class SiteError extends Error {}

function parseRange(value: unknown, label: keyof typeof LIMITS): number {
  const parsed = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new SiteError(`${label} must be a number`);
  }
  const { min, max } = LIMITS[label];
  if (parsed < min || parsed > max) {
    throw new SiteError(`${label} must be between ${min} and ${max}`);
  }
  return parsed;
}

function parseCoord(value: unknown, limit: number, label: string): number {
  const parsed = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new SiteError(`${label} must be a number in decimal degrees`);
  }
  if (Math.abs(parsed) > limit) {
    throw new SiteError(`${label} must be between -${limit} and ${limit}`);
  }
  return parsed;
}

/** Console labels are silk-screened into a narrow block, so keep them short. */
function parseName(value: unknown): string {
  if (typeof value !== 'string') throw new SiteError('site name must be text');
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned === '') throw new SiteError('site name cannot be empty');
  if (cleaned.length > MAX_NAME_LENGTH) {
    throw new SiteError(`site name cannot be longer than ${MAX_NAME_LENGTH} characters`);
  }
  return cleaned;
}

function readStored(): StoredSite {
  let raw: string;
  try {
    raw = readFileSync(STATE_FILE, 'utf8');
  } catch {
    // No saved position yet, or the state directory is unreadable.
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return {};
    return parsed as StoredSite;
  } catch {
    console.warn(`[site] ${STATE_FILE} is not valid JSON, ignoring it`);
    return {};
  }
}

/**
 * Replace the saved position, or remove it when given null. Writing through a
 * temporary file keeps a crash mid-save from leaving a half-written override.
 */
function writeStored(next: StoredSite | null): void {
  try {
    if (next === null) {
      unlinkSync(STATE_FILE);
      return;
    }
    mkdirSync(resolve(env.stateDir), { recursive: true });
    const temporary = join(resolve(env.stateDir), `site.json.${process.pid}.tmp`);
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    renameSync(temporary, STATE_FILE);
  } catch (error) {
    // A read-only volume should not take the receiver down; the position still
    // applies for this process, it just will not survive a restart.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && next === null) return;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[site] could not save to ${STATE_FILE}: ${message}`);
  }
}

let stored: StoredSite = readStored();

/** A stored number, or the environment's value when absent or nonsense. */
function storedNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function resolveSite(): Site {
  const storedLat = typeof stored.lat === 'number' && Number.isFinite(stored.lat) ? stored.lat : null;
  const storedLon = typeof stored.lon === 'number' && Number.isFinite(stored.lon) ? stored.lon : null;
  const fromConsole = storedLat !== null && storedLon !== null;

  const lat = fromConsole ? storedLat : env.lat;
  const lon = fromConsole ? storedLon : env.lon;
  const located = lat !== null && lon !== null;

  return {
    lat: located ? lat : null,
    lon: located ? lon : null,
    site: stored.site?.trim() || env.site,
    rangeNm: storedNumber(stored.rangeNm, env.rangeNm),
    alertRadiusNm: storedNumber(stored.alertRadiusNm, env.alertRadiusNm),
    alertAltitudeFt: storedNumber(stored.alertAltitudeFt, env.alertAltitudeFt),
    positionSource: !located ? 'none' : fromConsole ? 'console' : 'env',
  };
}

let current: Site = resolveSite();
const listeners = new Set<(site: Site) => void>();

export function currentSite(): Site {
  return current;
}

export function onSiteChange(listener: (site: Site) => void): void {
  listeners.add(listener);
}

function commit(next: StoredSite | null): Site {
  stored = next ?? {};
  writeStored(next);
  const before = current;
  current = resolveSite();
  const moved =
    before.lat !== current.lat ||
    before.lon !== current.lon ||
    before.site !== current.site ||
    before.rangeNm !== current.rangeNm ||
    before.alertRadiusNm !== current.alertRadiusNm ||
    before.alertAltitudeFt !== current.alertAltitudeFt ||
    before.positionSource !== current.positionSource;
  if (moved) for (const listener of listeners) listener(current);
  return current;
}

/**
 * Apply a position and/or name from the console. Throws SiteError on anything
 * malformed so the caller can answer 400 rather than silently drifting.
 */
export function updateSite(patch: Record<string, unknown>): Site {
  const next: StoredSite = { ...stored };

  const hasLat = patch.lat !== undefined && patch.lat !== null;
  const hasLon = patch.lon !== undefined && patch.lon !== null;
  if (hasLat !== hasLon) {
    throw new SiteError('lat and lon must be given together');
  }
  if (hasLat && hasLon) {
    next.lat = parseCoord(patch.lat, 90, 'lat');
    next.lon = parseCoord(patch.lon, 180, 'lon');
  }

  if (patch.site !== undefined && patch.site !== null) {
    next.site = parseName(patch.site);
  }

  for (const key of ['rangeNm', 'alertRadiusNm', 'alertAltitudeFt'] as const) {
    if (patch[key] !== undefined && patch[key] !== null) next[key] = parseRange(patch[key], key);
  }

  const touched = Object.keys(next).some((key) => patch[key] !== undefined && patch[key] !== null);
  if (!touched) {
    throw new SiteError(
      'nothing to change: send lat and lon, site, rangeNm, alertRadiusNm or alertAltitudeFt',
    );
  }

  // The alert volume has to sit inside the airspace the receiver actually pulls.
  const effectiveRange = storedNumber(next.rangeNm, env.rangeNm);
  const effectiveAlert = storedNumber(next.alertRadiusNm, env.alertRadiusNm);
  if (effectiveAlert > effectiveRange) {
    throw new SiteError(
      `alertRadiusNm (${effectiveAlert}) cannot be larger than rangeNm (${effectiveRange})`,
    );
  }

  return commit(next);
}

/** Drop the console's override and fall back to whatever .env says. */
export function resetSite(): Site {
  return commit(null);
}

export { STATE_FILE };
