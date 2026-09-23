import type { Aircraft } from './types';

/** Above the transition altitude aviation talks in flight levels, not feet. */
export function formatAltitude(ft: number | null, onGround = false): string {
  if (onGround) return 'GND';
  if (ft === null) return '—';
  if (ft >= 18000) return `FL${Math.round(ft / 100)}`;
  return `${Math.round(ft).toLocaleString('en-US')}′`;
}

/** Compact altitude for the on-scope data block: hundreds of feet. */
export function formatAltitudeBlock(ft: number | null, onGround = false): string {
  if (onGround) return 'GND';
  if (ft === null) return '---';
  return String(Math.round(ft / 100)).padStart(3, '0');
}

export function formatBearing(deg: number): string {
  return String(Math.round(deg) % 360).padStart(3, '0');
}

export function formatDistance(nm: number): string {
  return nm < 10 ? nm.toFixed(1) : String(Math.round(nm));
}

export function formatSpeed(kt: number | null): string {
  return kt === null ? '—' : String(Math.round(kt));
}

export function verticalArrow(rate: number | null): string {
  if (rate === null || Math.abs(rate) < 200) return '→';
  return rate > 0 ? '↑' : '↓';
}

export function formatVerticalRate(rate: number | null): string {
  if (rate === null) return '—';
  const rounded = Math.round(rate / 50) * 50;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`;
}

/** 16-point compass, used in the selected-contact readout. */
const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export function compassPoint(deg: number): string {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16] as string;
}

export function displayName(aircraft: Aircraft): string {
  return aircraft.flight ?? aircraft.registration ?? aircraft.hex.toUpperCase();
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Altitude band 0-1, surface to FL450. Drives the vertical gauge on each
 * flight strip — altitude is positional there rather than colour-coded, so
 * colour stays reserved for contact state.
 */
export function altitudeFraction(ft: number | null): number {
  if (ft === null) return 0;
  return Math.min(1, Math.max(0, ft / 45000));
}
