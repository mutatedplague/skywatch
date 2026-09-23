'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { iconForAircraft, sizeForIcon } from '@/lib/aircraftIcons';
import { displayName, formatAltitudeBlock } from '@/lib/format';
import { getAircraftSprite, preloadCommonIcons } from '@/lib/iconSprites';
import { TERRAIN_NONE, TerrainRaster } from '@/lib/terrain';
import { activeThemeId, palette, type RGB } from '@/lib/themes';
import type { TrackedPoint } from '@/lib/trackedPoint';
import type { Aircraft, SiteConfig } from '@/lib/types';

const SWEEP_PERIOD_MS = 4000;
const SWEEP_SPREAD_DEG = 78;

// Read per frame from the active theme, so switching theme repaints the scope.
let PHOSPHOR: RGB = palette().phosphor;
let STRIKE: RGB = palette().strike;
let SODIUM: RGB = palette().sodium;
let EMERGENCY: RGB = palette().emergency;

// Rings, spokes and bearing labels are structure, so they are drawn in the
// neutral ink instead of the accent. That keeps colour meaning what it says it
// means: accent for ordinary traffic, amber inside the alert volume, red for an
// emergency squawk.
let FURNITURE: RGB = palette().inkDim;

function syncPalette() {
  const p = palette();
  PHOSPHOR = p.phosphor;
  STRIKE = p.strike;
  SODIUM = p.sodium;
  EMERGENCY = p.emergency;
  FURNITURE = p.inkDim;
}

const rgba = (c: RGB, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Compass bearing (0 = north = up) to canvas angle. */
const bearingToCanvas = (deg: number) => ((deg - 90) * Math.PI) / 180;

interface Hit {
  hex: string;
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Symbology = 'icons' | 'blips';

export interface RadarScopeProps {
  aircraft: Aircraft[];
  config: SiteConfig | null;
  rangeNm: number;
  selectedHex: string | null;
  symbology: Symbology;
  /** Terrain layer id, or TERRAIN_NONE. */
  terrain: string;
  /** Written each frame with where the locked contact sits, for the callout. */
  pointRef: RefObject<TrackedPoint>;
  onSelect: (hex: string | null) => void;
}

export default function RadarScope({
  aircraft,
  config,
  rangeNm,
  selectedHex,
  symbology,
  terrain,
  pointRef,
  onSelect,
}: RadarScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Live props for the animation loop, so it never has to be torn down.
  const stateRef = useRef({ aircraft, config, rangeNm, selectedHex, symbology, terrain });
  stateRef.current = { aircraft, config, rangeNm, selectedHex, symbology, terrain };

  const hitsRef = useRef<Hit[]>([]);
  const hoverRef = useRef<string | null>(null);

  const pickAt = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: string | null = null;
    let bestDistance = 22;
    for (const hit of hitsRef.current) {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = hit.hex;
      }
    }
    return best;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = wrap.getBoundingClientRect();
      width = Math.max(240, rect.width);
      height = Math.max(240, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    preloadCommonIcons();
    const raster = new TerrainRaster(1024);
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    let frame = 0;
    const start = performance.now();

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const {
        aircraft: fleet,
        config: site,
        rangeNm: range,
        selectedHex: selected,
        symbology: symbols,
        terrain: terrainId,
      } = stateRef.current;

      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) / 2 - 26;
      const pxPerNm = R / range;
      const sweepDeg = (((now - start) / SWEEP_PERIOD_MS) * 360) % 360;

      ctx.clearRect(0, 0, width, height);

      // --- scope face ----------------------------------------------------
      syncPalette();
      const faceStops = palette().face;
      const face = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      face.addColorStop(0, rgba(faceStops[0], 1));
      face.addColorStop(0.7, rgba(faceStops[1], 1));
      face.addColorStop(1, rgba(faceStops[2], 1));
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      // --- terrain underlay ----------------------------------------------
      // The raster covers 2 × range on a side, so it lands exactly on the
      // scope circle's bounding box and the clip above trims it to the face.
      if (site && terrainId !== TERRAIN_NONE) {
        raster.configure(site.lat, site.lon, range * 2, terrainId, activeThemeId());
        if (raster.ready) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          ctx.drawImage(raster.canvas, cx - R, cy - R, R * 2, R * 2);
          ctx.restore();
        }
      }

      drawGrid(ctx, cx, cy, R);
      if (site) drawAlertRing(ctx, cx, cy, site.alertRadiusNm * pxPerNm, now);
      drawTrails(ctx, cx, cy, pxPerNm, fleet, site, range, selected);
      drawSweep(ctx, cx, cy, R, sweepDeg);

      const hits: Hit[] = [];
      const labelBoxes: Box[] = [];
      const showAllLabels = fleet.length <= 26;
      let located = false;

      for (const contact of fleet) {
        if (contact.distanceNm > range) continue;
        const r = contact.distanceNm * pxPerNm;
        const angle = bearingToCanvas(contact.bearingDeg);
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        hits.push({ hex: contact.hex, x, y });

        const behind = (((sweepDeg - contact.bearingDeg) % 360) + 360) % 360;
        // P7 phosphor: a hard blue-white strike decaying into a long green tail.
        const strikeAmount = Math.exp(-behind / 26);
        const persistence = Math.exp(-behind / 150);
        const isSelected = contact.hex === selected;
        const isHovered = contact.hex === hoverRef.current;

        let base: RGB = mix(PHOSPHOR, STRIKE, strikeAmount);
        if (contact.emergency) base = mix(EMERGENCY, STRIKE, strikeAmount * 0.5);
        else if (contact.overhead) base = mix(SODIUM, STRIKE, strikeAmount * 0.6);
        if (isSelected || isHovered) base = mix(base, STRIKE, 0.55);

        const alpha = Math.min(1, (isSelected || isHovered ? 0.55 : 0.28) + 0.72 * persistence);

        drawVector(ctx, x, y, contact, pxPerNm, base, alpha);
        drawBlip(ctx, x, y, contact, base, alpha, strikeAmount, symbols === 'icons');

        if (contact.emergency) drawStateRing(ctx, x, y, now, EMERGENCY, 13);
        else if (contact.overhead) drawStateRing(ctx, x, y, now, SODIUM, 13);
        if (isSelected) {
          located = true;
          if (pointRef.current) pointRef.current = { x, y, visible: true };
        }

        const wants =
          !isSelected && (isHovered || contact.emergency || contact.overhead || showAllLabels);
        if (wants) {
          drawDataBlock(ctx, x, y, contact, base, alpha, labelBoxes, isSelected || isHovered, R, cx, cy);
        }
      }

      hitsRef.current = hits;
      // The locked contact may have left range or gone stale since last frame.
      if (!located && pointRef.current?.visible) {
        pointRef.current = { x: 0, y: 0, visible: false };
      }
      drawSite(ctx, cx, cy, now);
      ctx.restore();

      drawBezel(ctx, cx, cy, R);
      drawRangeLabels(ctx, cx, cy, R, range);

      canvas.style.cursor = hoverRef.current ? 'pointer' : 'crosshair';
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Radar scope, ${aircraft.length} contacts within ${rangeNm} nautical miles. The contact list beside the scope has the same information in text.`}
        className="block h-full w-full touch-none"
        onPointerMove={(event) => {
          hoverRef.current = pickAt(event.clientX, event.clientY);
        }}
        onPointerLeave={() => {
          hoverRef.current = null;
        }}
        onClick={(event) => onSelect(pickAt(event.clientX, event.clientY))}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function drawGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.lineWidth = 1;

  for (let i = 1; i <= 4; i += 1) {
    const r = (R * i) / 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(FURNITURE, i === 4 ? 0.5 : 0.26);
    ctx.stroke();
  }

  for (let deg = 0; deg < 360; deg += 10) {
    const angle = bearingToCanvas(deg);
    const major = deg % 30 === 0;
    const inner = major ? 0 : R - 10;
    ctx.beginPath();
    ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
    ctx.lineTo(cx + R * Math.cos(angle), cy + R * Math.sin(angle));
    ctx.strokeStyle = rgba(FURNITURE, major ? 0.24 : 0.1);
    ctx.stroke();
  }
}

function drawAlertRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  now: number,
) {
  if (radius < 4) return;
  const pulse = 0.28 + 0.14 * Math.sin(now / 520);
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(SODIUM, pulse);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSweep(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  sweepDeg: number,
) {
  const segments = 42;
  for (let i = 0; i < segments; i += 1) {
    const a1 = sweepDeg - (i * SWEEP_SPREAD_DEG) / segments;
    const a0 = sweepDeg - ((i + 1) * SWEEP_SPREAD_DEG) / segments;
    const alpha = 0.16 * (1 - i / segments) ** 2.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, bearingToCanvas(a0), bearingToCanvas(a1));
    ctx.closePath();
    ctx.fillStyle = rgba(PHOSPHOR, alpha);
    ctx.fill();
  }

  const angle = bearingToCanvas(sweepDeg);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + R * Math.cos(angle), cy + R * Math.sin(angle));
  ctx.strokeStyle = rgba(PHOSPHOR, 0.42);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawTrails(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pxPerNm: number,
  fleet: Aircraft[],
  site: SiteConfig | null,
  range: number,
  selected: string | null,
) {
  if (!site) return;
  for (const contact of fleet) {
    if (contact.trail.length < 2) continue;
    const isSelected = contact.hex === selected;
    const points = contact.trail;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point) continue;
      const { distance, bearing } = relative(site.lat, site.lon, point.lat, point.lon);
      if (distance > range) continue;
      const age = i / points.length;
      const angle = bearingToCanvas(bearing);
      const r = distance * pxPerNm;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      ctx.fillStyle = rgba(PHOSPHOR, (isSelected ? 0.4 : 0.16) * age);
      ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
    }
  }
}

function drawVector(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  contact: Aircraft,
  pxPerNm: number,
  color: RGB,
  alpha: number,
) {
  if (contact.track === null || contact.groundSpeed === null || contact.groundSpeed < 30) return;
  // One minute of projected travel, clamped so slow traffic still shows a stub.
  const nm = contact.groundSpeed / 60;
  const length = Math.min(70, Math.max(9, nm * pxPerNm));
  const angle = bearingToCanvas(contact.track);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + length * Math.cos(angle), y + length * Math.sin(angle));
  ctx.strokeStyle = rgba(color, alpha * 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBlip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  contact: Aircraft,
  color: RGB,
  alpha: number,
  strikeAmount: number,
  useIcons: boolean,
) {
  // Military contacts get a square bracket, drawn unrotated around the blip.
  if (contact.military) {
    ctx.save();
    ctx.strokeStyle = rgba(color, alpha * 0.8);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 9.5, y - 9.5, 19, 19);
    ctx.restore();
  }

  if (useIcons) {
    const icon = iconForAircraft(contact);
    const size = sizeForIcon(icon);
    // Rasterise at 2x so the silhouette stays crisp on high-density displays.
    const sprite = getAircraftSprite(icon, size * 2, color);
    if (sprite) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((contact.track ?? 0) * Math.PI) / 180);
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 3 + 10 * strikeAmount;
      ctx.shadowColor = rgba(color, alpha);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }
    // Sprite still decoding — fall through to the vector blip this frame.
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowBlur = 4 + 12 * strikeAmount;
  ctx.shadowColor = rgba(color, alpha);
  ctx.fillStyle = rgba(color, alpha);
  ctx.strokeStyle = rgba(color, alpha);

  if (contact.category === 'A7') {
    // Rotorcraft read as a ring rather than a directional wedge.
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (contact.track !== null) {
    ctx.rotate(bearingToCanvas(contact.track) + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -5.2);
    ctx.lineTo(3.6, 4.2);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-3.6, 4.2);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawStateRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  color: RGB,
  radius: number,
) {
  const phase = (now % 1400) / 1400;
  ctx.beginPath();
  ctx.arc(x, y, radius * (0.55 + phase * 0.75), 0, Math.PI * 2);
  ctx.strokeStyle = rgba(color, 0.6 * (1 - phase));
  ctx.lineWidth = 1.2;
  ctx.stroke();
}


function drawDataBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  contact: Aircraft,
  color: RGB,
  alpha: number,
  boxes: Box[],
  force: boolean,
  R: number,
  cx: number,
  cy: number,
) {
  const name = displayName(contact);
  const second = `${formatAltitudeBlock(contact.altitude, contact.onGround)}  ${
    contact.groundSpeed === null ? '---' : Math.round(contact.groundSpeed)
  }`;

  ctx.font = '500 10px "Spline Sans Mono", ui-monospace, monospace';
  const width = Math.max(ctx.measureText(name).width, ctx.measureText(second).width) + 4;
  const height = 22;

  // Place the block clear of the blip, flipping sides near the scope edge.
  const candidates: Array<[number, number]> = [
    [11, -4],
    [-width - 11, -4],
    [11, -height - 2],
    [-width - 11, -height - 2],
  ];

  let placed: Box | null = null;
  for (const [dx, dy] of candidates) {
    const box: Box = { x: x + dx, y: y + dy, w: width, h: height };
    if (Math.hypot(box.x + width / 2 - cx, box.y + height / 2 - cy) > R - 6) continue;
    if (boxes.some((other) => overlaps(box, other))) continue;
    placed = box;
    break;
  }
  if (!placed) {
    if (!force) return;
    placed = { x: x + 11, y: y - 4, w: width, h: height };
  }
  boxes.push(placed);

  const textAlpha = Math.min(1, alpha + (force ? 0.3 : 0.05));
  ctx.textBaseline = 'top';
  ctx.fillStyle = rgba(color, textAlpha);
  ctx.font = '600 10px "Chakra Petch", "Spline Sans Mono", monospace';
  ctx.fillText(name, placed.x, placed.y);
  ctx.font = '400 10px "Spline Sans Mono", ui-monospace, monospace';
  ctx.fillStyle = rgba(color, textAlpha * 0.72);
  ctx.fillText(second, placed.x, placed.y + 11);

  // Leader line from blip to block, the way a real data block is tethered.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(placed.x < x ? placed.x + width : placed.x - 2, placed.y + 6);
  ctx.strokeStyle = rgba(color, textAlpha * 0.3);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function drawSite(ctx: CanvasRenderingContext2D, cx: number, cy: number, now: number) {
  const pulse = (now % 2600) / 2600;
  ctx.beginPath();
  ctx.arc(cx, cy, 4 + pulse * 26, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(STRIKE, 0.16 * (1 - pulse));
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = rgba(STRIKE, 0.75);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy);
  ctx.lineTo(cx + 6, cy);
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx, cy + 6);
  ctx.stroke();
}

function drawBezel(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(PHOSPHOR, 0.3);
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let deg = 0; deg < 360; deg += 30) {
    const angle = bearingToCanvas(deg);
    const cardinal = deg % 90 === 0;
    const label = cardinal
      ? (['N', 'E', 'S', 'W'][deg / 90] as string)
      : String(deg).padStart(3, '0');
    const lx = cx + (R + 17) * Math.cos(angle);
    const ly = cy + (R + 17) * Math.sin(angle);
    ctx.font = cardinal
      ? '500 12px "IBM Plex Sans", sans-serif'
      : '400 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = rgba(FURNITURE, cardinal ? 0.95 : 0.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, ly);
  }
  ctx.textAlign = 'left';
}

function drawRangeLabels(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  range: number,
) {
  ctx.font = '400 9px "Spline Sans Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let i = 1; i <= 4; i += 1) {
    const r = (R * i) / 4;
    const value = (range * i) / 4;
    const text = value < 10 ? value.toFixed(1) : String(Math.round(value));
    // Labels sit on the 045 radial, out of the way of most traffic.
    const angle = bearingToCanvas(45);
    ctx.fillStyle = rgba(FURNITURE, 0.55);
    ctx.fillText(text, cx + r * Math.cos(angle) + 3, cy + r * Math.sin(angle) - 5);
  }
}

/** Local great-circle helpers, duplicated from the backend for trail points. */
function relative(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const distance = 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(a)));

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

  return { distance, bearing };
}
