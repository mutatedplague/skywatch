/** Mirrors backend/src/types.ts. */

export interface TrailPoint {
  lat: number;
  lon: number;
  alt: number | null;
  t: number;
}

export interface Aircraft {
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
}

export interface Snapshot {
  now: number;
  aircraft: Aircraft[];
  stats: FeedStats;
  config: SiteConfig;
}

export type LinkState = 'connecting' | 'live' | 'lost';
