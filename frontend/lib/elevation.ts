'use client';

import { cachedTile, requestTile, TILE_PX, tileWindow, zoomFor } from './tiles';

/**
 * Ground heights, covering the same square as the map raster so the two line
 * up by construction: a texture coordinate on the disc reads the map from one
 * and the height from the other.
 *
 * Tiles are Terrarium-encoded PNGs from the AWS Terrain Tiles open dataset:
 * height in metres is (R × 256 + G + B / 256) − 32768. They are composited
 * with smoothing off, because blending the channels of neighbouring pixels
 * would invent heights that were never there.
 */

const TERRARIUM_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
/** Finer than this buys nothing at the raster's cell size. */
const MAX_ZOOM = 13;

export const ELEVATION_ATTRIBUTION = 'Mapzen, AWS Terrain Tiles';
export const FT_PER_M = 3.28084;

export class ElevationRaster {
  /** Bumped whenever the heights change, so dependants know to rebuild. */
  version = 0;
  /** True once every tile in the window has been decoded. */
  ready = false;
  /** Metres, row-major, row 0 at the north edge. Valid while `ready`. */
  readonly heights: Float32Array;
  /** Ground metres per raster cell, for slopes. Valid while `ready`. */
  metresPerPixel = 1;
  lowestM = 0;
  highestM = 0;

  private readonly canvas: HTMLCanvasElement;
  private key = '';
  private readonly listeners = new Set<() => void>();

  constructor(readonly size = 512) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
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
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, this.size, this.size);

      let expected = 0;
      let painted = 0;
      for (let tileY = firstY; tileY <= lastY; tileY += 1) {
        if (tileY < 0 || tileY >= span) continue;
        for (let tileX = firstX; tileX <= lastX; tileX += 1) {
          expected += 1;
          const wrappedX = ((tileX % span) + span) % span;
          const url = TERRARIUM_URL(zoom, wrappedX, tileY);
          const image = cachedTile(url) ?? requestTile(url, compose);
          if (!image) continue;
          ctx.drawImage(
            image,
            (tileX * TILE_PX - left) * scale,
            (tileY * TILE_PX - top) * scale,
            TILE_PX * scale,
            TILE_PX * scale,
          );
          painted += 1;
        }
      }
      // Half a window would decode as a cliff down to −32768 m along the seam.
      if (painted === 0 || painted < expected) return;

      const { data } = ctx.getImageData(0, 0, this.size, this.size);
      let lowest = Infinity;
      let highest = -Infinity;
      for (let i = 0, p = 0; i < this.heights.length; i += 1, p += 4) {
        const metres = data[p]! * 256 + data[p + 1]! + data[p + 2]! / 256 - 32768;
        this.heights[i] = metres;
        if (metres < lowest) lowest = metres;
        if (metres > highest) highest = metres;
      }
      this.lowestM = lowest;
      this.highestM = highest;
      this.metresPerPixel = window.metresPerPixel;
      this.ready = true;
      this.bump();
    };

    compose();
  }
}
