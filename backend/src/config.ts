function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.warn(`[config] ${name}="${raw}" is not a number, using ${fallback}`);
    return fallback;
  }
  return parsed;
}

function envStr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return !/^(0|false|no|off)$/i.test(raw.trim());
}

/** A coordinate from the environment, or null when unset or out of range. */
function envCoord(name: string, limit: number): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) {
    console.warn(`[config] ${name}="${raw}" is not a coordinate within ±${limit}, ignoring`);
    return null;
  }
  return parsed;
}

export type SourceName = 'demo' | 'dump1090' | 'adsblol' | 'airplaneslive' | 'opensky';

export const SOURCES: readonly SourceName[] = ['demo', 'dump1090', 'adsblol', 'airplaneslive', 'opensky'];

export function isSourceName(value: unknown): value is SourceName {
  return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

export const DEFAULT_POLL_MS: Record<SourceName, number> = {
  demo: 500,
  dump1090: 1000,
  // adsb.lol and airplanes.live both ask for no more than one request per second.
  adsblol: 2000,
  airplaneslive: 2000,
  opensky: 10000,
};

const geocodeRaw = envStr('GEOCODE_URL', 'https://nominatim.openstreetmap.org');

const requestedRaw = envStr('ADSB_SOURCE', 'adsblol').toLowerCase();
const requestedSource: SourceName = isSourceName(requestedRaw) ? requestedRaw : 'adsblol';

if (!isSourceName(requestedRaw)) {
  console.warn(`[config] unknown ADSB_SOURCE="${requestedRaw}", falling back to adsblol`);
}

/**
 * What the poller, tracker and source adapters read. The site position is not
 * fixed at boot — the console can move it — so this is an interface and
 * `runtime` serves live values through it.
 */
export interface Config {
  port: number;
  host: string;
  site: string;
  lat: number;
  lon: number;
  rangeNm: number;
  source: SourceName;
  simulated: boolean;
  pollMs: number;
  alertRadiusNm: number;
  alertAltitudeFt: number;
  staleSeconds: number;
  dump1090Url: string;
  openskyClientId: string;
  openskyClientSecret: string;
  corsOrigin: string;
}

/**
 * Settings straight from the environment. The site, the feed and its
 * credentials are only the starting point: whatever the console saves takes
 * precedence, so read the live values from `runtime` rather than here.
 */
export const env = {
  port: envNum('PORT', 4000),
  host: envStr('HOST', '0.0.0.0'),
  site: envStr('SITE_NAME', 'HOME'),
  lat: envCoord('HOME_LAT', 90),
  lon: envCoord('HOME_LON', 180),
  requestedSource,
  /** Radius the backend pulls traffic for. The UI zooms within this. */
  rangeNm: Math.min(250, Math.max(5, envNum('RANGE_NM', 100))),
  /** Set only when POLL_MS is given; otherwise the per-source default applies. */
  pollMsOverride:
    process.env.POLL_MS === undefined || process.env.POLL_MS.trim() === ''
      ? null
      : Math.max(250, envNum('POLL_MS', 1000)),
  /** A contact closer than this and lower than ALERT_ALTITUDE_FT is "overhead". */
  alertRadiusNm: envNum('ALERT_RADIUS_NM', 3),
  alertAltitudeFt: envNum('ALERT_ALTITUDE_FT', 12000),
  /** Drop a contact this many seconds after its last position report. */
  staleSeconds: envNum('STALE_SECONDS', 75),
  dump1090Url: envStr('DUMP1090_URL', 'http://dump1090:8080/data/aircraft.json'),
  openskyClientId: envStr('OPENSKY_CLIENT_ID', ''),
  openskyClientSecret: envStr('OPENSKY_CLIENT_SECRET', ''),
  corsOrigin: envStr('CORS_ORIGIN', '*'),
  /** Set ALLOW_SITE_EDIT=false to stop the console moving the site. */
  allowSiteEdit: envBool('ALLOW_SITE_EDIT', true),
  /** Where a console-saved position is persisted. */
  stateDir: envStr('STATE_DIR', 'state'),
  /** A Nominatim-compatible geocoder for the address box, or null when off. */
  geocodeUrl: /^(off|false|no|none|0)$/i.test(geocodeRaw) ? null : geocodeRaw,
} as const;
