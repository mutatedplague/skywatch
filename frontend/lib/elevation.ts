'use client';

import { cachedTile, requestTile, TILE_PX, tileWindow, zoomFor } from './tiles';

/**
 * Ground heights, covering the same square as the map raster so the two line
 * up by construction: a texture coordinate on the disc reads the map from one
 * and the height from the other.
 *
 * Tiles are Terrarium-encoded PNGs from the AWS Terrain Tiles open dataset:
 * height in metres is (R × 256 + G + B / 256) − 32768. Each tile is decoded
 * once at its native size, and the grid is then filled by exact nearest
 * sampling. Letting the canvas scale or place the tiles would blend channels
 * across pixels, and a blended G or B wraps into hundreds of metres of height
 * that was never there.
 */

const TERRARIUM_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
/** Finer than this buys nothing at the raster's cell size. */
const MAX_ZOOM = 13;

export const ELEVATION_ATTRIBUTION = 'Mapzen, AWS Terrain Tiles';
export const FT_PER_M = 3.28084;

/** Decoded tiles, in metres, shared across instances. */
const decodedTiles = new Map<string, Float32Array>();
let scratch: CanvasRenderingContext2D | null = null;

function decodeTile(url: string, image: HTMLImageElement): Float32Array | null {
  const cached = decodedTiles.get(url);
  if (cached) return cached;
  if (!scratch) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_PX;
    canvas.height = TILE_PX;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
    if (!scratch) return null;
  }
  scratch.clearRect(0, 0, TILE_PX, TILE_PX);
  scratch.drawImage(image, 0, 0);
  const { data } = scratch.getImageData(0, 0, TILE_PX, TILE_PX);
  const heights = new Float32Array(TILE_PX * TILE_PX);
  for (let i = 0, p = 0; i < heights.length; i += 1, p += 4) {
    heights[i] = data[p]! * 256 + data[p + 1]! + data[p + 2]! / 256 - 32768;
  }
  decodedTiles.set(url, heights);
  return heights;
}

export class ElevationRaster {
  /** Bumped whenever the heights change, so dependants know to rebuild. */
  version = 0;
  /** True once every tile in the window has been decoded. */
  ready = false;
  /** Metres, row-major, row 0 at the north edge. Valid while `ready`. */
  readonly heights: Float32Array;
  /** Ground metres per raster cell, for slopes. Valid while `ready`. */
  metresPerPixel = 1;
  /**
   * The 1st and 99th percentile of the heights in view, not the extremes: the
   * source data carries the odd void-fill needle, and a decision about how
   * tall to draw the ground should not hang on four bad pixels.
   */
  lowestM = 0;
  highestM = 0;

  private key = '';
  private readonly listeners = new Set<() => void>();

  constructor(readonly size = 512) {
    this.heights = new Float32Array(size * size);
  }

  /** Called on every version change: a reset to loading, or new heights. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Point the raster at a site and span. Cheap to call every frame. */
  configure(lat: number, lon: number, spanNm: number): void {
    const quantised = Math.round(spanNm * 10) / 10;
    const key = `${lat.toFixed(4)}|${lon.toFixed(4)}|${quantised}`;
    if (key === this.key) return;

    this.key = key;
    this.ready = false;
    this.bump();
    this.paint(lat, lon, quantised);
  }

  /**
   * Height in metres at a texture coordinate: u west→east, v south→north,
   * both 0..1, the same convention as the map texture on the disc.
   */
  heightAt(u: number, v: number): number {
    if (!this.ready) return 0;
    const max = this.size - 1;
    const fx = Math.min(1, Math.max(0, u)) * max;
    const fy = (1 - Math.min(1, Math.max(0, v))) * max;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(max, x0 + 1);
    const y1 = Math.min(max, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const h = this.heights;
    const top = h[y0 * this.size + x0]! * (1 - tx) + h[y0 * this.size + x1]! * tx;
    const bottom = h[y1 * this.size + x0]! * (1 - tx) + h[y1 * this.size + x1]! * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /** The ground under the site itself, in metres. */
  get siteHeight(): number {
    return this.heightAt(0.5, 0.5);
  }

  private bump(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private paint(lat: number, lon: number, spanNm: number): void {
    // Ask for tiles a few times finer than the raster, so each cell is a real
    // sample rather than one source pixel smeared across several.
    const zoom = zoomFor(lat, spanNm, this.size * 3, MAX_ZOOM);
    const window = tileWindow(lat, lon, spanNm, zoom, this.size);
    if (!window) return;
    const { left, top, scale, firstX, lastX, firstY, lastY, span } = window;

    const key = this.key;
    const compose = () => {
      // A later configure() supersedes this window; let its tiles drive it.
      if (this.key !== key) return;

      // Every tile has to be in hand before any height is trusted: half a
      // window would read as a cliff down to −32768 m along the seam.
      const tiles = new Map<string, Float32Array>();
      for (let tileY = firstY; tileY <= lastY; tileY += 1) {
        if (tileY < 0 || tileY >= span) continue;
        for (let tileX = firstX; tileX <= lastX; tileX += 1) {
          const wrappedX = ((tileX % span) + span) % span;
          const url = TERRARIUM_URL(zoom, wrappedX, tileY);
          const image = cachedTile(url) ?? requestTile(url, compose);
          const heights = image ? decodeTile(url, image) : null;
          if (!heights) return;
          tiles.set(`${tileX}|${tileY}`, heights);
        }
      }

      for (let cy = 0; cy < this.size; cy += 1) {
        // The window pixel under this cell's centre, in this zoom's pixels.
        const py = top + (cy + 0.5) / scale;
        const tileY = Math.floor(py / TILE_PX);
        const localY = Math.min(TILE_PX - 1, Math.max(0, Math.floor(py - tileY * TILE_PX)));
        for (let cx = 0; cx < this.size; cx += 1) {
          const px = left + (cx + 0.5) / scale;
          const tileX = Math.floor(px / TILE_PX);
          const localX = Math.min(TILE_PX - 1, Math.max(0, Math.floor(px - tileX * TILE_PX)));
          const tile = tiles.get(`${tileX}|${tileY}`);
          // Off the top or bottom of the world: carry the nearest real row.
          this.heights[cy * this.size + cx] = tile ? tile[localY * TILE_PX + localX]! : 0;
        }
      }

      this.metresPerPixel = window.metresPerPixel;
      this.despike();
      [this.lowestM, this.highestM] = this.percentiles(0.01, 0.99);
      this.ready = true;
      this.bump();
    };

    compose();
  }

  /**
   * Replace any cell that stands far above or below the median of its eight
   * neighbours. Real ground has cliffs, but a cliff has two sides; a cell
   * that disagrees with everything around it is a void-fill artifact. The
   * threshold scales with the cell size so steep country is left alone.
   */
  private despike(): void {
    const n = this.size;
    const h = this.heights;
    const source = Float32Array.from(h);
    const threshold = Math.max(250, 1.5 * this.metresPerPixel);
    const ring = new Float32Array(8);
    for (let y = 1; y < n - 1; y += 1) {
      for (let x = 1; x < n - 1; x += 1) {
        const i = y * n + x;
        ring[0] = source[i - n - 1]!;
        ring[1] = source[i - n]!;
        ring[2] = source[i - n + 1]!;
        ring[3] = source[i - 1]!;
        ring[4] = source[i + 1]!;
        ring[5] = source[i + n - 1]!;
        ring[6] = source[i + n]!;
        ring[7] = source[i + n + 1]!;
        const sorted = ring.slice().sort();
        const median = (sorted[3]! + sorted[4]!) / 2;
        if (Math.abs(source[i]! - median) > threshold) h[i] = median;
      }
    }
  }

  /** Heights at the given quantiles, from a thinned sample of the grid. */
  private percentiles(low: number, high: number): [number, number] {
    const sample: number[] = [];
    for (let i = 0; i < this.heights.length; i += 7) sample.push(this.heights[i]!);
    sample.sort((a, b) => a - b);
    const at = (q: number) => sample[Math.min(sample.length - 1, Math.floor(q * sample.length))]!;
    return [at(low), at(high)];
  }
}
