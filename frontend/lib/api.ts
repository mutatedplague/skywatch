import type { SiteConfig } from './types';

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
  site?: string;
  rangeNm?: number;
  alertRadiusNm?: number;
  alertAltitudeFt?: number;
  /** Drop the console's saved position and fall back to the receiver's .env. */
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
