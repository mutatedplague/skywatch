'use client';

/**
 * Web Mercator tile maths and a shared image cache, used by both the map
 * raster and the elevation raster so the two composite the same window.
 */

export const TILE_PX = 256;
/** Equatorial metres per pixel at zoom 0 for 256px tiles. */
export const EQUATOR_MPP = 156543.03392;
export const METRES_PER_NM = 1852;
/** A hard ceiling on tiles per composite, so a wide range cannot fan out. */
export const MAX_TILES = 90;

const images = new Map<string, HTMLImageElement>();
const failed = new Set<string>();

/** Shared across instances, so switching view or range reuses what is loaded. */
export function requestTile(url: string, onLoad: () => void): HTMLImageElement | null {
  const existing = images.get(url);
  if (existing) return existing.complete && existing.naturalWidth > 0 ? existing : null;
  if (failed.has(url)) return null;

  const image = new Image();
  // Required: a tainted canvas cannot be read back or uploaded as a texture.
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.onload = onLoad;
  image.onerror = () => {
    failed.add(url);
    images.delete(url);
  };
  image.src = url;
  images.set(url, image);
  return null;
}

/** A tile already in the cache and decoded, or null. Never starts a request. */
export function cachedTile(url: string): HTMLImageElement | null {
  const image = images.get(url);
  return image && image.complete && image.naturalWidth > 0 ? image : null;
}

export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

export function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const radians = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom;
}

/** The zoom whose pixels are just finer than the span we have to cover. */
export function zoomFor(lat: number, spanNm: number, sizePx: number, maxZoom: number): number {
  const metresNeededPerPixel = (spanNm * METRES_PER_NM) / sizePx;
  const scale = (EQUATOR_MPP * Math.cos((lat * Math.PI) / 180)) / metresNeededPerPixel;
  return Math.max(1, Math.min(maxZoom, Math.floor(Math.log2(scale))));
}

/** The tiles covering a square of spanNm centred on a point, and how to place them. */
export interface TileWindow {
  zoom: number;
  /** Top-left of the window in this zoom's pixels. */
  left: number;
  top: number;
  /** Canvas pixels per tile pixel. */
  scale: number;
  firstX: number;
  lastX: number;
  firstY: number;
  lastY: number;
  /** Tiles per axis at this zoom, for wrapping east/west. */
  span: number;
  /** Ground metres per canvas pixel. */
  metresPerPixel: number;
}

export function tileWindow(
  lat: number,
  lon: number,
  spanNm: number,
  zoom: number,
  sizePx: number,
): TileWindow | null {
  const metresPerTilePixel = (EQUATOR_MPP * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  const spanTilePx = (spanNm * METRES_PER_NM) / metresPerTilePixel;
  const centreX = lonToTileX(lon, zoom) * TILE_PX;
  const centreY = latToTileY(lat, zoom) * TILE_PX;
  const left = centreX - spanTilePx / 2;
  const top = centreY - spanTilePx / 2;
  const window: TileWindow = {
    zoom,
    left,
    top,
    scale: sizePx / spanTilePx,
    firstX: Math.floor(left / TILE_PX),
    lastX: Math.floor((left + spanTilePx) / TILE_PX),
    firstY: Math.floor(top / TILE_PX),
    lastY: Math.floor((top + spanTilePx) / TILE_PX),
    span: 2 ** zoom,
    metresPerPixel: (spanNm * METRES_PER_NM) / sizePx,
  };
  const tiles = (window.lastX - window.firstX + 1) * (window.lastY - window.firstY + 1);
  return tiles > MAX_TILES ? null : window;
}
