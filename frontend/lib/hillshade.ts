'use client';

import { type ElevationRaster, FT_PER_M } from './elevation';
import type { Mode } from './themes';

/**
 * Shaded relief drawn from the heights themselves, rather than borrowed from
 * a map server. Shading is what makes terrain legible, and it has to be
 * sharper than the geometry: a few hundred feet of rolling ground is nothing
 * against a 45,000 ft ceiling, but lit from the north-west with the slope
 * exaggerated — the usual cartographic z-factor — it reads at a glance. Only
 * the lighting is exaggerated; nothing here moves a vertex.
 *
 * Contours are drawn at an interval picked from the relief in view, so a
 * flood plain and an alpine valley each get a readable number of lines.
 *
 * On a dark console the ground is a dark grey that lit slopes brighten; on a
 * light one it is a pale grey that shadowed slopes darken, and contours are
 * drawn dark rather than bright. Either way the ground stays an underlay.
 */

/** Slope multiplier for lighting only. */
const Z_FACTOR = 4;
/** Light from the north-west, 45° up, the convention every relief map shares. */
const LIGHT = [-0.5, 0.5, Math.SQRT1_2] as const;
const CONTOUR_STEPS_FT = [100, 200, 500, 1000, 2000, 5000];
/** Index contours, drawn brighter so the eye can count. */
const INDEX_EVERY = 5;

/** The contour interval that gives a readable count of lines, or 0 for none. */
export function contourIntervalFt(reliefFt: number): number {
  for (const step of CONTOUR_STEPS_FT) {
    if (reliefFt / step <= 14) return reliefFt / step >= 2.5 ? step : 0;
  }
  return CONTOUR_STEPS_FT[CONTOUR_STEPS_FT.length - 1]!;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Paint hillshade and contours over the whole target canvas. Returns the
 * contour interval used, in feet, or 0 when the ground was too flat for any.
 */
export function paintRelief(
  target: HTMLCanvasElement,
  elevation: ElevationRaster,
  mode: Mode = 'dark',
): number {
  const light = mode === 'light';
  const n = elevation.size;
  const h = elevation.heights;
  const mpp = elevation.metresPerPixel;
  const work = document.createElement('canvas');
  work.width = n;
  work.height = n;
  const ctx = work.getContext('2d');
  const out = target.getContext('2d');
  if (!ctx || !out) return 0;

  const intervalFt = contourIntervalFt((elevation.highestM - elevation.lowestM) * FT_PER_M);
  const intervalM = intervalFt / FT_PER_M;
  const image = ctx.createImageData(n, n);
  const data = image.data;
  const [lx, ly, lz] = LIGHT;

  for (let y = 0; y < n; y += 1) {
    const up = y > 0 ? -n : 0;
    const down = y < n - 1 ? n : 0;
    for (let x = 0; x < n; x += 1) {
      const i = y * n + x;
      const left = x > 0 ? -1 : 0;
      const right = x < n - 1 ? 1 : 0;
      // Row 0 is north, so "up" in the raster is north on the ground.
      const dzdx = ((h[i + right]! - h[i + left]!) / (2 * mpp)) * Z_FACTOR;
      const dzdn = ((h[i + up]! - h[i + down]!) / (2 * mpp)) * Z_FACTOR;
      const length = Math.sqrt(dzdx * dzdx + dzdn * dzdn + 1);
      const shade = Math.max(0, (-dzdx * lx - dzdn * ly + lz) / length);

      // Dark: flat ground lands at 0.4; a lit slope climbs toward 0.8, a
      // shadowed one drops toward black. Light: flat ground lands at 0.8 and
      // the shadows do the work. The contrast is the point either way.
      let value = light
        ? clamp(0.8 + (shade - Math.SQRT1_2) * 1.1, 0.3, 0.98)
        : clamp(0.4 + (shade - Math.SQRT1_2) * 1.3, 0.05, 0.82);
      if (h[i]! <= 0) value *= light ? 0.88 : 0.75;

      if (intervalM > 0) {
        const level = Math.floor(h[i]! / intervalM);
        const crossesEast = x < n - 1 && Math.floor(h[i + 1]! / intervalM) !== level;
        const crossesSouth = y < n - 1 && Math.floor(h[i + n]! / intervalM) !== level;
        if (crossesEast || crossesSouth) {
          const weight = level % INDEX_EVERY === 0 ? 0.34 : 0.2;
          value = light ? Math.max(0, value - weight * 0.9) : Math.min(1, value + weight);
        }
      }

      const grey = Math.round(value * 255);
      const p = i * 4;
      data[p] = grey;
      data[p + 1] = grey;
      data[p + 2] = grey;
      data[p + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.globalCompositeOperation = 'source-over';
  out.clearRect(0, 0, target.width, target.height);
  out.imageSmoothingEnabled = true;
  out.drawImage(work, 0, 0, target.width, target.height);
  return intervalFt;
}
