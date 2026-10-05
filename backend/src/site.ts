import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { env, isSourceName, SOURCES, type SourceName } from './config.js';

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
  /** The address the position was looked up from; null when typed or from .env. */
  address: string | null;
  /** The feed chosen from the console; null means ADSB_SOURCE from the environment. */
  source: SourceName | null;
  /** Console overrides for the feed's own settings; null falls back to the environment. */
  dump1090Url: string | null;
  openskyClientId: string | null;
  openskyClientSecret: string | null;
}

/** The shape persisted to disk. Every field is optional: the console may save
 *  an alert volume without ever touching the position, or the other way round. */
export interface StoredSite {
  lat?: number | null;
  lon?: number | null;
  address?: string | null;
  site?: string | null;
  rangeNm?: number | null;
  alertRadiusNm?: number | null;
  alertAltitudeFt?: number | null;
  source?: SourceName | null;
  dump1090Url?: string | null;
  openskyClientId?: string | null;
  openskyClientSecret?: string | null;
}

/** Bounds the console is held to. The receiver is the authority, not the form. */
const LIMITS = {
  rangeNm: { min: 5, max: 250 },
  alertRadiusNm: { min: 0.25, max: 250 },
  alertAltitudeFt: { min: 500, max: 60000 },
} as const;

const STATE_FILE = resolve(env.stateDir, 'site.json');
const MAX_NAME_LENGTH = 24;
const MAX_ADDRESS_LENGTH = 160;
const MAX_URL_LENGTH = 300;
const MAX_CREDENTIAL_LENGTH = 200;

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

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Console labels are silk-screened into a narrow block, so keep them short. */
function parseName(value: unknown): string {
  if (typeof value !== 'string') throw new SiteError('site name must be text');
  const cleaned = value.replace(CONTROL_CHARS, '').trim();
  if (cleaned === '') throw new SiteError('site name cannot be empty');
  if (cleaned.length > MAX_NAME_LENGTH) {
    throw new SiteError(`site name cannot be longer than ${MAX_NAME_LENGTH} characters`);
  }
  return cleaned;
}

/** Free text that may be blank, where blank means "none" rather than an error. */
function parseText(value: unknown, label: string, max: number): string | null {
  if (typeof value !== 'string') throw new SiteError(`${label} must be text`);
  const cleaned = value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (cleaned === '') return null;
  if (cleaned.length > max) throw new SiteError(`${label} cannot be longer than ${max} characters`);
  return cleaned;
}

function parseSource(value: unknown): SourceName {
  const cleaned = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (!isSourceName(cleaned)) throw new SiteError(`source must be one of ${SOURCES.join(', ')}`);
  return cleaned;
}

function parseUrl(value: unknown, label: string): string | null {
  const cleaned = parseText(value, label, MAX_URL_LENGTH);
  if (cleaned === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new SiteError(`${label} must be a full URL, like http://192.168.1.50:8080/data/aircraft.json`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SiteError(`${label} must start with http:// or https://`);
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

/** A stored string, or null when absent or blank. */
function storedText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
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
    address: fromConsole ? storedText(stored.address) : null,
    source: isSourceName(stored.source) ? stored.source : null,
    dump1090Url: storedText(stored.dump1090Url),
    openskyClientId: storedText(stored.openskyClientId),
    openskyClientSecret: storedText(stored.openskyClientSecret),
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
  const changed = (Object.keys(current) as Array<keyof Site>).some(
    (key) => before[key] !== current[key],
  );
  if (changed) for (const listener of listeners) listener(current);
  return current;
}

/**
 * Validate a patch from the console into stored fields without applying it.
 * Only the fields present in the patch come back, so the result can be laid
 * over the saved site (to update it) or over the live config (to try it out).
 * Throws SiteError on anything malformed so the caller can answer 400.
 */
export function parsePatch(patch: Record<string, unknown>): StoredSite {
  const given = (key: string) => patch[key] !== undefined && patch[key] !== null;
  const next: StoredSite = {};

  if (given('lat') !== given('lon')) {
    throw new SiteError('lat and lon must be given together');
  }
  if (given('lat')) {
    next.lat = parseCoord(patch.lat, 90, 'lat');
    next.lon = parseCoord(patch.lon, 180, 'lon');
    // A new position without an address must not keep wearing the old one.
    if (!given('address')) next.address = null;
  }
  if (given('address')) next.address = parseText(patch.address, 'address', MAX_ADDRESS_LENGTH);
  if (given('site')) next.site = parseName(patch.site);

  for (const key of ['rangeNm', 'alertRadiusNm', 'alertAltitudeFt'] as const) {
    if (given(key)) next[key] = parseRange(patch[key], key);
  }

  if (given('source')) next.source = parseSource(patch.source);
  if (given('dump1090Url')) next.dump1090Url = parseUrl(patch.dump1090Url, 'dump1090Url');
  if (given('openskyClientId')) {
    next.openskyClientId = parseText(patch.openskyClientId, 'openskyClientId', MAX_CREDENTIAL_LENGTH);
  }
  if (given('openskyClientSecret')) {
    next.openskyClientSecret = parseText(
      patch.openskyClientSecret,
      'openskyClientSecret',
      MAX_CREDENTIAL_LENGTH,
    );
  }

  return next;
}

/** Apply a patch from the console and tell every listener what changed. */
export function updateSite(patch: Record<string, unknown>): Site {
  const parsed = parsePatch(patch);
  if (Object.keys(parsed).length === 0) {
    throw new SiteError(
      'nothing to change: send lat and lon, address, site, source, rangeNm, alertRadiusNm or alertAltitudeFt',
    );
  }
  const next: StoredSite = { ...stored, ...parsed };

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
