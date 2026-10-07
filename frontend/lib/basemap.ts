'use client';

import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { Mode } from './themes';
import { TILE_PX, tileWindow, type TileWindow, zoomFor } from './tiles';

/**
 * Roads, water, towns and airports, drawn over the terrain from OpenStreetMap
 * data served as vector tiles by OpenFreeMap — no key, no account. The tiles
 * are decoded here and drawn straight onto the terrain raster in the same
 * pixel space the map tiles and the relief use, so everything lines up.
 *
 * Styling is achromatic and quiet on purpose: this is context under the
 * traffic, and colour on the console means something else. The ink is white
 * on a dark console and black on a light one.
 */

export const BASEMAP_ATTRIBUTION = 'OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors';
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const MAX_ZOOM = 14;

/** Road classes drawn, with width and brightness; anything else is skipped. */
const ROADS: Record<string, { width: number; alpha: number; minZoom: number }> = {
  motorway: { width: 2.6, alpha: 0.9, minZoom: 0 },
  trunk: { width: 2.1, alpha: 0.75, minZoom: 0 },
  primary: { width: 1.6, alpha: 0.6, minZoom: 0 },
  secondary: { width: 1.2, alpha: 0.45, minZoom: 9 },
  tertiary: { width: 0.9, alpha: 0.32, minZoom: 11 },
  minor: { width: 0.7, alpha: 0.22, minZoom: 13 },
};
const ROAD_ORDER = ['minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];

const PLACES: Record<string, { px: number; alpha: number; minZoom: number }> = {
  city: { px: 15, alpha: 0.85, minZoom: 0 },
  town: { px: 12, alpha: 0.65, minZoom: 10 },
  village: { px: 11, alpha: 0.5, minZoom: 12 },
};

const AERODROMES: Record<string, number> = { international: 0, public: 10, regional: 10, military: 10 };

// Shared across instances, like the image tile cache: null marks a tile that
// failed or is empty, so it is not asked for again.
let templatePromise: Promise<string | null> | null = null;
const decoded = new Map<string, VectorTile | null>();
const inflight = new Set<string>();

function tileTemplate(): Promise<string | null> {
  templatePromise ??= fetch(TILEJSON_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((json: { tiles?: string[] } | null) => json?.tiles?.[0] ?? null)
    .catch(() => null);
  return templatePromise;
}

function requestVectorTile(url: string, onLoad: () => void): VectorTile | null {
  const cached = decoded.get(url);
  if (cached !== undefined) return cached;
  if (inflight.has(url)) return null;
  inflight.add(url);
  fetch(url)
    .then(async (response) => {
      if (response.status === 204 || response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
    })
    .then((tile) => {
      decoded.set(url, tile);
    })
    .catch(() => {
      decoded.set(url, null);
    })
    .finally(() => {
      inflight.delete(url);
      onLoad();
    });
  return null;
}

/** A name a Latin-script reader can say, when the data offers one. */
function nameOf(feature: VectorTileFeature): string | null {
  const props = feature.properties as Record<string, unknown>;
  const name = props['name:latin'] ?? props.name_en ?? props['name:en'] ?? props.name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Box, boxes: Box[]): boolean {
  return boxes.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
}

export class BasemapOverlay {
  /** Bumped whenever a tile lands, so the raster knows to repaint. */
  version = 0;

  private key = '';
  private window: TileWindow | null = null;
  private zoom = 0;
  private template: string | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Point the overlay at the raster's window. Cheap to call every frame. */
  configure(lat: number, lon: number, spanNm: number, sizePx: number): void {
    const key = `${lat.toFixed(4)}|${lon.toFixed(4)}|${spanNm}|${sizePx}`;
    if (key === this.key) return;
    this.key = key;
    // One zoom coarser than the raster would want: roads are drawn at a fixed
    // width in canvas pixels anyway, and it keeps the window to a few tiles.
    this.zoom = zoomFor(lat, spanNm, sizePx / 2, MAX_ZOOM);
    this.window = tileWindow(lat, lon, spanNm, this.zoom, sizePx);
    void tileTemplate().then((template) => {
      if (this.key !== key) return;
      this.template = template;
      this.bump();
    });
  }

  private bump(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** Draw whatever tiles have arrived. Missing ones are requested and will bump. */
  draw(ctx: CanvasRenderingContext2D, sizePx: number, mode: Mode = 'dark'): void {
    const window = this.window;
    const template = this.template;
    if (!window || !template) return;
    const light = mode === 'light';
    // Text gets a halo in the ground's own tone, so a name reads on lit and
    // shadowed slopes alike.
    const ink = light ? '0,0,0' : '255,255,255';
    const halo = light ? '255,255,255' : '0,0,0';
    const key = this.key;
    const onLoad = () => {
      if (this.key === key) this.bump();
    };

    const tiles: Array<{ tile: VectorTile; tileX: number; tileY: number }> = [];
    for (let tileY = window.firstY; tileY <= window.lastY; tileY += 1) {
      if (tileY < 0 || tileY >= window.span) continue;
      for (let tileX = window.firstX; tileX <= window.lastX; tileX += 1) {
        const wrappedX = ((tileX % window.span) + window.span) % window.span;
        const url = template
          .replace('{z}', String(this.zoom))
          .replace('{x}', String(wrappedX))
          .replace('{y}', String(tileY));
        const tile = requestVectorTile(url, onLoad);
        if (tile) tiles.push({ tile, tileX, tileY });
      }
    }
    if (tiles.length === 0) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.rect(0, 0, sizePx, sizePx);
    ctx.clip();

    const place = (tileX: number, tileY: number, extent: number) => {
      const originX = (tileX * TILE_PX - window.left) * window.scale;
      const originY = (tileY * TILE_PX - window.top) * window.scale;
      const unit = (TILE_PX * window.scale) / extent;
      return (x: number, y: number): [number, number] => [originX + x * unit, originY + y * unit];
    };

    // Water first, so roads cross it; then roads minor to major, so the
    // motorway is drawn last and on top; then names, which must not collide.
    for (const { tile, tileX, tileY } of tiles) {
      const water = tile.layers.water;
      if (water) {
        const project = place(tileX, tileY, water.extent);
        ctx.fillStyle = light ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.45)';
        for (let i = 0; i < water.length; i += 1) {
          const feature = water.feature(i);
          if (feature.type !== 3) continue;
          ctx.beginPath();
          for (const ring of feature.loadGeometry()) {
            ring.forEach((point, index) => {
              const [x, y] = project(point.x, point.y);
              if (index === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.closePath();
          }
          ctx.fill('evenodd');
        }
      }
      const waterway = tile.layers.waterway;
      if (waterway) {
        const project = place(tileX, tileY, waterway.extent);
        ctx.strokeStyle = light ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < waterway.length; i += 1) {
          const feature = waterway.feature(i);
          if (feature.type !== 2 || feature.properties.class !== 'river') continue;
          this.strokeLines(ctx, feature, project);
        }
      }
    }

    for (const roadClass of ROAD_ORDER) {
      const style = ROADS[roadClass]!;
      if (this.zoom < style.minZoom) continue;
      ctx.strokeStyle = `rgba(${ink},${style.alpha})`;
      ctx.lineWidth = style.width;
      for (const { tile, tileX, tileY } of tiles) {
        const roads = tile.layers.transportation;
        if (!roads) continue;
        const project = place(tileX, tileY, roads.extent);
        for (let i = 0; i < roads.length; i += 1) {
          const feature = roads.feature(i);
          if (feature.type !== 2 || feature.properties.class !== roadClass) continue;
          this.strokeLines(ctx, feature, project);
        }
      }
    }

    const placed: Box[] = [];
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const { tile, tileX, tileY } of tiles) {
      const aerodromes = tile.layers.aerodrome_label;
      if (aerodromes) {
        const project = place(tileX, tileY, aerodromes.extent);
        ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'left';
        for (let i = 0; i < aerodromes.length; i += 1) {
          const feature = aerodromes.feature(i);
          const minZoom = AERODROMES[String(feature.properties.class)];
          if (minZoom === undefined || this.zoom < minZoom) continue;
          const point = feature.loadGeometry()[0]?.[0];
          if (!point) continue;
          const [x, y] = project(point.x, point.y);
          const props = feature.properties as Record<string, unknown>;
          const code = (typeof props.icao === 'string' && props.icao) || (typeof props.iata === 'string' && props.iata) || nameOf(feature);
          if (!code) continue;
          const width = ctx.measureText(code).width;
          const box = { x: x - 4, y: y - 7, w: width + 14, h: 14 };
          if (overlaps(box, placed)) continue;
          placed.push(box);
          ctx.strokeStyle = `rgba(${ink},0.8)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.stroke();
          label(ctx, code, x + 6, y, `rgba(${ink},0.8)`, halo);
        }
      }
    }
    for (const placeClass of ['city', 'town', 'village']) {
      const style = PLACES[placeClass]!;
      if (this.zoom < style.minZoom) continue;
      ctx.font = `500 ${style.px}px "IBM Plex Sans", ui-sans-serif, sans-serif`;
      ctx.textAlign = 'center';
      for (const { tile, tileX, tileY } of tiles) {
        const places = tile.layers.place;
        if (!places) continue;
        const project = place(tileX, tileY, places.extent);
        for (let i = 0; i < places.length; i += 1) {
          const feature = places.feature(i);
          if (feature.properties.class !== placeClass) continue;
          const name = nameOf(feature);
          const point = feature.loadGeometry()[0]?.[0];
          if (!name || !point) continue;
          const [x, y] = project(point.x, point.y);
          const width = ctx.measureText(name).width;
          const box = { x: x - width / 2 - 4, y: y - style.px / 2 - 2, w: width + 8, h: style.px + 4 };
          if (overlaps(box, placed)) continue;
          placed.push(box);
          label(ctx, name, x, y, `rgba(${ink},${style.alpha})`, halo);
        }
      }
    }

    ctx.restore();
  }

  private strokeLines(
    ctx: CanvasRenderingContext2D,
    feature: VectorTileFeature,
    project: (x: number, y: number) => [number, number],
  ): void {
    ctx.beginPath();
    for (const line of feature.loadGeometry()) {
      line.forEach((point, index) => {
        const [x, y] = project(point.x, point.y);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    }
    ctx.stroke();
  }

}

/** Text with a halo behind it, so it reads on lit and shadowed ground alike. */
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  halo: string,
): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(${halo},0.75)`;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
