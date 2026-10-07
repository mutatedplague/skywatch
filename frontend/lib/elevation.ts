'use client';

import {
  EQUATOR_MPP,
  latToTileY,
  lonToTileX,
  MAX_TILES,
  METRES_PER_NM,
  requestTile,
  TILE_PX,
  zoomFor,
} from './terrain';

/**
 * Ground heights for the 3D view's relief, covering the same square as the
 * terrain raster so the two line up by construction: a texture coordinate on
 * the disc reads the map from one and the height from the other.
 *
 * Tiles are Terrarium-encoded PNGs from the AWS Terrain Tiles open dataset:
 * height in metres is (R × 256 + G + B / 256) − 32768. They are composited
 * with smoothing off, because blending the channels of neighbouring pixels
 * would invent heights that were never there.
 */

const TERRARIUM_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
/** Finer than this buys nothing at the disc's vertex spacing. */
const MAX_ZOOM = 13;

export const ELEVATION_ATTRIBUTION = 'Mapzen, AWS Terrain Tiles';

export class ElevationRaster {
  /** Bumped whenever the heights change, so dependants know to rebuild. */
  version = 0;
  /** True once every tile in the window has been decoded. */
  ready = false;

  private readonly canvas: HTMLCanvasElement;
  private heights: Float32Array;
  private key = '';

  constructor(readonly size = 160) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.heights = new Float32Array(size * size);
  }

  /** Point the raster at a site and span. Cheap to call every frame. */
  configure(lat: number, lon: number, spanNm: number): void {
    const quantised = Math.round(spanNm * 10) / 10;
    const key = `${lat.toFixed(4)}|${lon.toFixed(4)}|${quantised}`;
    if (key === this.key) return;

    this.key = key;
    this.ready = false;
    this.version += 1;
    this.paint(lat, lon, quantised);
  }

  /**
   * Height in metres at a texture coordinate: u west→east, v south→north,
   * both 0..1, the same convention as the terrain texture on the disc.
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

  private paint(lat: number, lon: number, spanNm: number): void {
    // Ask for tiles a few times finer than the raster, so each height cell is
    // a real sample rather than one source pixel smeared across several.
    const zoom = zoomFor(lat, spanNm, this.size * 3, MAX_ZOOM);
    const metresPerTilePixel = (EQUATOR_MPP * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
    const spanTilePx = (spanNm * METRES_PER_NM) / metresPerTilePixel;
    const centreX = lonToTileX(lon, zoom) * TILE_PX;
    const centreY = latToTileY(lat, zoom) * TILE_PX;
    const left = centreX - spanTilePx / 2;
    const top = centreY - spanTilePx / 2;
    const scale = this.size / spanTilePx;

    const firstX = Math.floor(left / TILE_PX);
    const lastX = Math.floor((left + spanTilePx) / TILE_PX);
    const firstY = Math.floor(top / TILE_PX);
    const lastY = Math.floor((top + spanTilePx) / TILE_PX);
    const span = 2 ** zoom;
    if ((lastX - firstX + 1) * (lastY - firstY + 1) > MAX_TILES) return;

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
          const image = requestTile(TERRARIUM_URL(zoom, wrappedX, tileY), compose);
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
      for (let i = 0, p = 0; i < this.heights.length; i += 1, p += 4) {
        this.heights[i] = data[p]! * 256 + data[p + 1]! + data[p + 2]! / 256 - 32768;
      }
      this.ready = true;
      this.version += 1;
    };

    compose();
  }
}
