/** Shared wire types. Kept in sync by hand with frontend/lib/types.ts. */

/** A position sample kept for drawing a track history trail. */
export interface TrailPoint {
  lat: number;
  lon: number;
  alt: number | null;
  t: number;
}

/** One decoded ADS-B report, before the tracker adds derived/history fields. */
export interface RawAircraft {
  hex: string;
  flight: string | null;
  registration: string | null;
  type: string | null;
  lat: number;
  lon: number;
  altitude: number | null;
  altitudeGeom: number | null;
  groundSpeed: number | null;
  track: number | null;
  verticalRate: number | null;
  squawk: string | null;
  category: string | null;
  onGround: boolean;
  rssi: number | null;
  seen: number;
  military: boolean;
}

/** A tracked contact: a report plus everything derived from the site position. */
export interface Aircraft extends RawAircraft {
  distanceNm: number;
  bearingDeg: number;
  firstSeen: number;
  lastSeen: number;
  emergency: boolean;
  overhead: boolean;
  trail: TrailPoint[];
}

export interface FeedStats {
  tracked: number;
  overhead: number;
  closestNm: number | null;
  messages: number;
  sourceOk: boolean;
  lastUpdate: number;
  latencyMs: number;
  error: string | null;
}

export interface SiteConfig {
  site: string;
  lat: number;
  lon: number;
  rangeNm: number;
  source: string;
  sourceLabel: string;
  simulated: boolean;
  alertRadiusNm: number;
  alertAltitudeFt: number;
  pollMs: number;
  /** Where the position in force came from: .env, the console, or nowhere yet. */
  positionSource: 'env' | 'console' | 'none';
  /** False when ALLOW_SITE_EDIT=false; the console hides its site control. */
  siteEditable: boolean;
  /** The address the position was looked up from, when it was. */
  address: string | null;
  /** False when GEOCODE_URL=off; the console hides its address box. */
  addressLookup: boolean;
  /** The feed in force once there is a position; `source` is what runs right now. */
  requestedSource: string;
  /** Whether the feed choice came from the console or ADSB_SOURCE. */
  sourceFrom: 'env' | 'console';
  dump1090Url: string;
  openskyClientId: string;
  /** The secret itself never leaves the receiver; the console only learns one is set. */
  openskyHasSecret: boolean;
}

export interface Snapshot {
  now: number;
  aircraft: Aircraft[];
  stats: FeedStats;
  config: SiteConfig;
}

/** What `POST /api/source/test` answers: did one fetch from that feed work. */
export interface SourceProbe {
  ok: boolean;
  source: string;
  label: string;
  /** Aircraft the feed returned, and how many of those sit inside the range. */
  aircraft: number;
  inRange: number;
  latencyMs: number;
  error: string | null;
}
