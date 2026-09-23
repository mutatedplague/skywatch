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

export type SourceName = 'demo' | 'dump1090' | 'adsblol' | 'airplaneslive' | 'opensky';

const SOURCES: SourceName[] = ['demo', 'dump1090', 'adsblol', 'airplaneslive', 'opensky'];

/** Home position is required for real feeds; without it we fall back to the simulator. */
const latRaw = process.env.HOME_LAT;
const lonRaw = process.env.HOME_LON;
const hasSite =
  latRaw !== undefined &&
  lonRaw !== undefined &&
  Number.isFinite(Number(latRaw)) &&
  Number.isFinite(Number(lonRaw));

const requested = envStr('ADSB_SOURCE', 'adsblol').toLowerCase() as SourceName;
const source: SourceName = SOURCES.includes(requested) ? requested : 'adsblol';

if (!SOURCES.includes(requested)) {
  console.warn(`[config] unknown ADSB_SOURCE="${requested}", falling back to adsblol`);
}
if (!hasSite && source !== 'demo') {
  console.warn('[config] HOME_LAT/HOME_LON are not set — starting in simulation mode.');
}

const DEFAULT_POLL_MS: Record<SourceName, number> = {
  demo: 500,
  dump1090: 1000,
  // adsb.lol and airplanes.live both ask for no more than one request per second.
  adsblol: 2000,
  airplaneslive: 2000,
  opensky: 10000,
};

const effectiveSource: SourceName = hasSite ? source : 'demo';

export const config = {
  port: envNum('PORT', 4000),
  host: envStr('HOST', '0.0.0.0'),
  site: envStr('SITE_NAME', 'HOME'),
  /** Falls back to a spot over open water so a misconfigured deploy is obvious. */
  lat: hasSite ? Number(latRaw) : 0,
  lon: hasSite ? Number(lonRaw) : 0,
  /** Radius the backend pulls traffic for. The UI zooms within this. */
  rangeNm: Math.min(250, Math.max(5, envNum('RANGE_NM', 100))),
  source: effectiveSource,
  simulated: effectiveSource === 'demo',
  pollMs: Math.max(250, envNum('POLL_MS', DEFAULT_POLL_MS[effectiveSource])),
  /** A contact closer than this and lower than ALERT_ALTITUDE_FT is "overhead". */
  alertRadiusNm: envNum('ALERT_RADIUS_NM', 3),
  alertAltitudeFt: envNum('ALERT_ALTITUDE_FT', 12000),
  /** Drop a contact this many seconds after its last position report. */
  staleSeconds: envNum('STALE_SECONDS', 75),
  dump1090Url: envStr('DUMP1090_URL', 'http://dump1090:8080/data/aircraft.json'),
  openskyClientId: envStr('OPENSKY_CLIENT_ID', ''),
  openskyClientSecret: envStr('OPENSKY_CLIENT_SECRET', ''),
  corsOrigin: envStr('CORS_ORIGIN', '*'),
} as const;

export type Config = typeof config;
