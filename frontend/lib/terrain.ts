'use client';

/**
 * Terrain underlay shared by both views.
 *
 * Web Mercator tiles are fetched and composited into one square offscreen
 * canvas covering 2 × rangeNm on a side, centred on the site. Both consumers
 * then need only one line of maths: the 2D scope blits that square across the
 * scope circle's bounding box, and the 3D disc uses it as the texture on a
 * CircleGeometry, whose UVs already map to the same bounding square.
 *
 * Mercator is conformal, so near the centre the scale is uniform and this is
 * accurate; by the edge of a wide range ring it stretches slightly in latitude.
 * For an underlay meant to answer "what am I looking at" that is a fair trade
 * against reprojecting every tile per frame.
 *
 * Tiles come from a third party, which is a real departure from the rest of
 * SKYWATCH: it means the console reaches the internet, and the tile server can
 * infer roughly where the site is from what it asks for. TERRAIN_NONE keeps the
 * old behaviour and is honoured everywhere.
 */

export interface TerrainLayer {
  id: string;
  label: string;
  /** Tile URL; note Esri orders the path z/y/x, not z/x/y. */
  url: (z: number, x: number, y: number) => string;
  attribution: string;
  maxZoom: number;
  /** neutral strips the tiles' colour entirely; natural keeps it, dimmed. */
  treatment: 'neutral' | 'natural';
}

export const TERRAIN_NONE = 'none';

export const TERRAIN_LAYERS: TerrainLayer[] = [
  {
    id: 'relief',
    label: 'relief',
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Esri, USGS',
    maxZoom: 13,
    treatment: 'neutral',
  },
  {
    id: 'imagery',
    label: 'satellite',
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
    treatment: 'natural',
  },
  {
    id: 'streets',
    label: 'streets',
    url: (z, x, y) => `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 19,
    treatment: 'neutral',
  },
];

export function terrainLayer(id: string): TerrainLayer | null {
  return TERRAIN_LAYERS.find((layer) => layer.id === id) ?? null;
}

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
  // Required: a tainted canvas cannot be uploaded as a WebGL texture.
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

export class TerrainRaster {
  readonly canvas: HTMLCanvasElement;
  /** Bumped whenever new tiles land, so a texture knows to re-upload. */
  version = 0;
  /** True once at least one tile has been painted. */
  ready = false;

  private key = '';
  private layer: TerrainLayer | null = null;

  constructor(private readonly size = 1024) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
  }

  get attribution(): string | null {
    return this.layer?.attribution ?? null;
  }

  /**
   * Point the raster at a site and span. Cheap to call every frame: it only does
   * work when the site, span or layer actually changed, or when a pending tile
   * has since arrived.
   */
  configure(lat: number, lon: number, spanNm: number, layerId: string, themeId = ''): void {
    const layer = terrainLayer(layerId);
    // Quantise the span so nudging the range slider does not thrash the cache.
    const quantised = Math.round(spanNm * 10) / 10;
    // themeId is part of the key: the phosphor tint is baked into the raster.
    const key = `${layer?.id ?? TERRAIN_NONE}|${lat.toFixed(4)}|${lon.toFixed(4)}|${quantised}|${themeId}`;
    if (key === this.key) return;

    this.key = key;
    this.layer = layer;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    this.ready = false;
    this.version += 1;

    if (!layer) return;
    this.paint(layer, lat, lon, quantised);
  }

  private paint(layer: TerrainLayer, lat: number, lon: number, spanNm: number): void {
    const zoom = zoomFor(lat, spanNm, this.size, layer.maxZoom);
    const metresPerTilePixel = (EQUATOR_MPP * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
    // The span, expressed in this zoom's pixels, then in whole tiles.
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

    const onLoad = () => {
      // Re-composite from cache; every tile that has arrived gets painted.
      if (this.key.startsWith(`${layer.id}|`)) this.compose(layer, zoom, left, top, scale, firstX, lastX, firstY, lastY, span);
    };

    this.compose(layer, zoom, left, top, scale, firstX, lastX, firstY, lastY, span, onLoad);
  }

  private compose(
    layer: TerrainLayer,
    zoom: number,
    left: number,
    top: number,
    scale: number,
    firstX: number,
    lastX: number,
    firstY: number,
    lastY: number,
    span: number,
    onLoad?: () => void,
  ): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.size, this.size);

    let painted = 0;
    for (let tileY = firstY; tileY <= lastY; tileY += 1) {
      if (tileY < 0 || tileY >= span) continue;
      for (let tileX = firstX; tileX <= lastX; tileX += 1) {
        // Wrap east/west so a site near the antimeridian still fills.
        const wrappedX = ((tileX % span) + span) % span;
        const url = layer.url(zoom, wrappedX, tileY);
        const image = onLoad ? requestTile(url, onLoad) : (images.get(url) ?? null);
        if (!image || !image.complete || image.naturalWidth === 0) continue;
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

    if (painted === 0) return;

    // Treatment, applied once here so both views get an identical underlay.
    //
    // Terrain is context, not data, so it stays achromatic: colour on this
    // console means something (accent = active, amber = in the alert volume,
    // red = emergency) and a tinted map would compete with all three. Tiles
    // are also darkened hard, because an underlay that reads as brightly as
    // the traffic on top of it is not an underlay.
    if (layer.treatment === 'neutral') {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, this.size, this.size);
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = layer.treatment === 'neutral' ? '#a6a6a6' : '#b4b4b4';
    ctx.fillRect(0, 0, this.size, this.size);
    ctx.globalCompositeOperation = 'source-over';

    this.ready = true;
    this.version += 1;
  }
}
