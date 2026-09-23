'use client';

/**
 * Loads the aircraft SVGs once, then keeps a small cache of pre-tinted raster
 * copies. The scope recolours every contact each frame as the sweep decays, so
 * tint colours are quantised into buckets and the tinted bitmaps are reused.
 */

const loaded = new Map<string, HTMLImageElement>();
const failed = new Set<string>();
const tinted = new Map<string, HTMLCanvasElement>();

const MAX_TINTED = 700;

function requestIcon(name: string): HTMLImageElement | null {
  const existing = loaded.get(name);
  if (existing) return existing.complete && existing.naturalWidth > 0 ? existing : null;
  if (failed.has(name)) return null;

  const image = new Image();
  image.decoding = 'async';
  image.onerror = () => {
    failed.add(name);
    loaded.delete(name);
  };
  image.src = `/icons/${name}.svg`;
  loaded.set(name, image);
  return null;
}

/** Quantise to 16 levels per channel so the cache stays small. */
function bucket(color: [number, number, number]): string {
  const q = (v: number) => Math.min(255, Math.round(v / 16) * 16);
  return `${q(color[0])},${q(color[1])},${q(color[2])}`;
}

export function getAircraftSprite(
  name: string,
  size: number,
  color: [number, number, number],
): HTMLCanvasElement | null {
  const image = requestIcon(name);
  if (!image) return null;

  const rounded = Math.round(size);
  const key = `${name}|${rounded}|${bucket(color)}`;
  const cached = tinted.get(key);
  if (cached) return cached;

  if (tinted.size > MAX_TINTED) tinted.clear();

  const canvas = document.createElement('canvas');
  canvas.width = rounded;
  canvas.height = rounded;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, rounded, rounded);
  // Recolour the silhouette while keeping its alpha channel.
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = `rgb(${bucket(color)})`;
  ctx.fillRect(0, 0, rounded, rounded);

  tinted.set(key, canvas);
  return canvas;
}

/** Warm the cache for the icons most likely to appear first. */
export function preloadCommonIcons() {
  for (const name of ['a1', 'a3', 'a5', 'a7', 'a320', 'b737', 'cessna', 'crjx']) {
    requestIcon(name);
  }
}
