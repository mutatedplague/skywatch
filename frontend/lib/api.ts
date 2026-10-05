import type { SiteConfig, SourceName, SourceProbe } from './types';

/**
 * The browser may be on a different host than the one that built the image,
 * so the API base is resolved at runtime from the page URL unless overridden.
 */
export function resolveHttpBase(): string {
  const override = process.env.NEXT_PUBLIC_API_URL;
  if (override) return override.replace(/\/+$/, '');
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const port = process.env.NEXT_PUBLIC_API_PORT ?? '4000';
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

export interface SitePatch {
  lat?: number;
  lon?: number;
  /** Caption for the position. Empty clears it; omitted with a new position also clears it. */
  address?: string;
  site?: string;
  rangeNm?: number;
  alertRadiusNm?: number;
  alertAltitudeFt?: number;
  source?: SourceName;
  /** Feed settings. Blank falls back to the receiver's .env. */
  dump1090Url?: string;
  openskyClientId?: string;
  openskyClientSecret?: string;
  /** Drop everything the console saved and fall back to the receiver's .env. */
  reset?: true;
}

/**
 * Move the site. The receiver answers with the new config and pushes a frame to
 * every scope, so the caller does not need to apply anything itself — it only
 * has to surface the error when the receiver rejects the values.
 */
export async function saveSite(patch: SitePatch): Promise<SiteConfig> {
  const response = await fetch(`${resolveHttpBase()}/api/site`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });

  let payload: { config?: SiteConfig; error?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Fall through to a status-based message below.
  }

  if (!response.ok || !payload.config) {
    throw new Error(payload.error ?? `receiver refused the change (HTTP ${response.status})`);
  }
  return payload.config;
}

export interface SourceProbeRequest {
  source: SourceName;
  dump1090Url?: string;
  openskyClientId?: string;
  openskyClientSecret?: string;
  lat?: number;
  lon?: number;
  rangeNm?: number;
}

/** One fetch from a feed with these settings, without saving anything. */
export async function testSource(request: SourceProbeRequest): Promise<SourceProbe> {
  const response = await fetch(`${resolveHttpBase()}/api/source/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });

  let payload: Partial<SourceProbe> & { error?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Fall through to a status-based message below.
  }

  if (!response.ok || typeof payload.ok !== 'boolean') {
    throw new Error(payload.error ?? `the receiver could not run the test (HTTP ${response.status})`);
  }
  return payload as SourceProbe;
}

export interface GeocodeHit {
  label: string;
  lat: number;
  lon: number;
}

async function geocode(params: Record<string, string>): Promise<GeocodeHit[]> {
  const response = await fetch(`${resolveHttpBase()}/api/geocode?${new URLSearchParams(params)}`);

  let payload: { results?: GeocodeHit[]; error?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Fall through to a status-based message below.
  }

  if (!response.ok || !payload.results) {
    throw new Error(payload.error ?? `address lookup failed (HTTP ${response.status})`);
  }
  return payload.results;
}

/** Places matching a typed address, nearest-match first. */
export function searchAddress(query: string): Promise<GeocodeHit[]> {
  return geocode({ q: query });
}

/** The address nearest a position, or null when the geocoder cannot name it. */
export async function describePosition(lat: number, lon: number): Promise<GeocodeHit | null> {
  const hits = await geocode({ lat: String(lat), lon: String(lon) });
  return hits[0] ?? null;
}
