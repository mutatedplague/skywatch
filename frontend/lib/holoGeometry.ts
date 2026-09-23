/**
 * Scene scaling for the holographic view.
 *
 * The disc is always DISC_UNITS across whatever range the operator has
 * selected, so the camera never has to move when they zoom — only the nm→unit
 * factor changes. Altitude gets its own, deliberately exaggerated scale:
 * 45,000 ft is barely 7 nm, which would be visually flat against a 50 nm disc,
 * so height is stretched and the altitude ruler is labelled with real numbers
 * to keep it honest.
 */
export const DISC_UNITS = 100;
export const CEILING_FT = 45_000;
export const CEILING_UNITS = 58;

export function unitsPerNm(rangeNm: number): number {
  return DISC_UNITS / Math.max(1, rangeNm);
}

export function altitudeUnits(altitudeFt: number | null): number {
  if (altitudeFt === null) return 0;
  return (Math.max(0, altitudeFt) / CEILING_FT) * CEILING_UNITS;
}

/** Range and bearing to scene position. North is -Z, east is +X. */
export function groundPosition(
  distanceNm: number,
  bearingDeg: number,
  rangeNm: number,
): [number, number] {
  const scale = unitsPerNm(rangeNm);
  const radians = (bearingDeg * Math.PI) / 180;
  return [distanceNm * scale * Math.sin(radians), -distanceNm * scale * Math.cos(radians)];
}

/** Ring radii in nm that read cleanly for a given outer range. */
export function ringRadii(rangeNm: number): number[] {
  const step =
    rangeNm <= 10 ? 2 : rangeNm <= 25 ? 5 : rangeNm <= 50 ? 10 : rangeNm <= 100 ? 25 : 50;
  const rings: number[] = [];
  for (let radius = step; radius < rangeNm; radius += step) rings.push(radius);
  return rings;
}

/** Flight levels to tick on the altitude ruler, skipping any above the ceiling. */
export function altitudeTicks(): Array<{ ft: number; label: string }> {
  return [10_000, 20_000, 30_000, 40_000]
    .filter((ft) => ft <= CEILING_FT)
    .map((ft) => ({ ft, label: `FL${String(ft / 100).padStart(3, '0')}` }));
}
