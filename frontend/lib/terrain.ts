'use client';

import { BasemapOverlay } from './basemap';
import { ELEVATION_ATTRIBUTION, ElevationRaster } from './elevation';
import { paintRelief } from './hillshade';
import { cachedTile, requestTile, TILE_PX, tileWindow, zoomFor } from './tiles';

/**
 * The ground under the traffic.
 *
 * One square offscreen canvas covers 2 × rangeNm on a side, centred on the
 * site, and the 3D disc uses it as its texture through UVs that map to the
 * same bounding square. Relief is drawn here from elevation data — hillshade
 * and contours — so it is as sharp as the ground deserves; satellite and
 * streets are Web Mercator tiles composited into the square. Roads, water,
 * towns and airports are then drawn over relief and satellite from vector
 * tiles, in the same pixel space, so they land where they belong.
 *
 * Mercator is conformal, so near the centre the scale is uniform; by the edge
 * of a wide range ring it stretches slightly in latitude, a fair trade against
 * reprojecting everything per frame.
 *
 * Any layer means the console reaches the internet, and the servers can infer
 * roughly where the site is from what they are asked for. TERRAIN_NONE keeps
 * the old behaviour and is honoured everywhere.
 */

export interface TerrainLayer {
  id: string;
  label: string;
  /** Drawn from elevation data here, or composited from a tile server. */
  source: 'elevation' | 'tiles';
  /** Tile URL; note Esri orders the path z/y/x, not z/x/y. */
  url?: (z: number, x: number, y: number) => string;
  attribution: string;
  maxZoom: number;
  /** neutral strips the tiles' colour entirely; natural keeps it, dimmed. */
  treatment: 'neutral' | 'natural';
  /** Whether roads, water and names are drawn on top. Streets has its own. */
  overlay: boolean;
}

export const TERRAIN_NONE = 'none';

export const TERRAIN_LAYERS: TerrainLayer[] = [
  {
    id: 'relief',
    label: 'relief',
    source: 'elevation',
    attribution: ELEVATION_ATTRIBUTION,
    maxZoom: 13,
    treatment: 'neutral',
    overlay: true,
  },
  {
    id: 'imagery',
    label: 'satellite',
    source: 'tiles',
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
    treatment: 'natural',
    overlay: true,
  },
  {
    id: 'streets',
    label: 'streets',
    source: 'tiles',
    url: (z, x, y) => `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 19,
    treatment: 'neutral',
    overlay: false,
  },
];

export function terrainLayer(id: string): TerrainLayer | null {
  return TERRAIN_LAYERS.find((layer) => layer.id === id) ?? null;
}

export class TerrainRaster {
  readonly canvas: HTMLCanvasElement;
  /** Heights for the window, shared with the relief geometry. */
  readonly elevation: ElevationRaster;
  /** Roads, water and names for the window. */
  readonly basemap: BasemapOverlay;
  /** Bumped whenever the picture changes, so a texture knows to re-upload. */
  version = 0;
  /** True once something has been painted. */
  ready = false;
  /** Feet between contour lines on the relief layer; 0 when flat or not relief. */
  contourIntervalFt = 0;

  private key = '';
  private layer: TerrainLayer | null = null;
  /** Redraws the base and the overlay from whatever has arrived so far. */
  private repaint: (() => void) | null = null;

  constructor(private readonly size = 1024) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.elevation = new ElevationRaster(512);
    this.basemap = new BasemapOverlay();
    this.elevation.subscribe(() => {
      if (this.layer?.source === 'elevation' && this.elevation.ready) this.repaint?.();
    });
    this.basemap.subscribe(() => {
      if (this.layer?.overlay) this.repaint?.();
    });
  }

  get attribution(): string | null {
    return this.layer?.attribution ?? null;
  }

  /**
   * Point the raster at a site and span. Cheap to call every frame: it only does
   * work when the site, span or layer actually changed, or when pending data
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
    this.contourIntervalFt = 0;
    this.repaint = null;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    this.ready = false;
    this.version += 1;

    if (!layer) return;
    if (layer.overlay) this.basemap.configure(lat, lon, quantised, this.size);

    if (layer.source === 'elevation') {
      this.elevation.configure(lat, lon, quantised);
      this.repaint = () => {
        this.contourIntervalFt = paintRelief(this.canvas, this.elevation);
        this.finish(ctx, layer);
      };
      if (this.elevation.ready) this.repaint();
      return;
    }
    this.paintTiles(ctx, layer, lat, lon, quantised);
  }

  /** The overlay goes on last, and the picture is declared ready. */
  private finish(ctx: CanvasRenderingContext2D, layer: TerrainLayer): void {
    if (layer.overlay) this.basemap.draw(ctx, this.size);
    this.ready = true;
    this.version += 1;
  }

  private paintTiles(
    ctx: CanvasRenderingContext2D,
    layer: TerrainLayer,
    lat: number,
    lon: number,
    spanNm: number,
  ): void {
    const zoom = zoomFor(lat, spanNm, this.size, layer.maxZoom);
    const window = tileWindow(lat, lon, spanNm, zoom, this.size);
    if (!window || !layer.url) return;
    const url = layer.url;
    const key = this.key;

    const compose = () => {
      // A later configure() supersedes this window; let its tiles drive it.
      if (this.key !== key) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, this.size, this.size);

      let painted = 0;
      for (let tileY = window.firstY; tileY <= window.lastY; tileY += 1) {
        if (tileY < 0 || tileY >= window.span) continue;
        for (let tileX = window.firstX; tileX <= window.lastX; tileX += 1) {
          // Wrap east/west so a site near the antimeridian still fills.
          const wrappedX = ((tileX % window.span) + window.span) % window.span;
          const tileUrl = url(zoom, wrappedX, tileY);
          const image = cachedTile(tileUrl) ?? requestTile(tileUrl, compose);
          if (!image) continue;
          ctx.drawImage(
            image,
            (tileX * TILE_PX - window.left) * window.scale,
            (tileY * TILE_PX - window.top) * window.scale,
            TILE_PX * window.scale,
            TILE_PX * window.scale,
          );
          painted += 1;
        }
      }

      if (painted === 0) return;

      // Treatment, applied once here so the texture is ready to use.
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

      this.finish(ctx, layer);
    };

    this.repaint = compose;
    compose();
  }
}
