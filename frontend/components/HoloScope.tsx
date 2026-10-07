'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { iconForAircraft } from '@/lib/aircraftIcons';
import { FT_PER_M } from '@/lib/elevation';
import { relative } from '@/lib/geo';
import {
  altitudeTicks,
  CEILING_FT,
  CEILING_UNITS,
  DISC_UNITS,
  groundPosition,
  ringRadii,
  unitsPerNm,
} from '@/lib/holoGeometry';
import { getAircraftSprite } from '@/lib/iconSprites';
import { TERRAIN_NONE, TerrainRaster } from '@/lib/terrain';
import { activeThemeId, palette, rgbHex } from '@/lib/themes';
import type { TrackedPoint } from '@/lib/trackedPoint';
import type { Aircraft, SiteConfig } from '@/lib/types';

/** Icon plate size in world units — fixed, so glyphs stay legible at any range. */
const GLYPH_UNITS = 11;
const SPRITE_PX = 96;
/** The receiver keeps 90 trail points; one more joins the tail to the glyph. */
const MAX_TRAIL_POINTS = 96;
/** Relief mesh density: enough vertices for a ridge to read, few enough to displace per frame. */
const RELIEF_RINGS = 48;
const RELIEF_SEGMENTS = 96;
const SPOKE_STEPS = 40;

interface HoloScopeProps {
  aircraft: Aircraft[];
  config: SiteConfig | null;
  rangeNm: number;
  selectedHex: string | null;
  /** Terrain layer id, or TERRAIN_NONE. */
  terrain: string;
  /** Active theme id; a change rebuilds the scene with the new palette. */
  theme: string;
  /** Written each frame with where the locked contact sits, for the callout. */
  pointRef: RefObject<TrackedPoint>;
  onSelect: (hex: string | null) => void;
}

interface Contact {
  group: THREE.Group;
  /** Carries the heading, so the glyph turns without dragging the stalk round. */
  pivot: THREE.Group;
  glyph: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  stalk: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  pad: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** Where it has been: fades toward the tail. */
  trail: THREE.Line<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Where it will be in a minute, climb or descent included. */
  vector: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial | THREE.LineDashedMaterial>;
  vectorSolid: THREE.LineBasicMaterial;
  vectorDashed: THREE.LineDashedMaterial;
  label: THREE.Sprite;
  labelTexture: THREE.CanvasTexture;
  labelCanvas: HTMLCanvasElement;
  iconKey: string;
  labelKey: string;
  trailKey: string;
}

/** Opacities by how the contact stands relative to the lock. */
const TIER = {
  normal: { glyph: 0.92, stalk: 0.34, pad: 0.4, trail: 0.55, vector: 0.5, label: 1 },
  dim: { glyph: 0.55, stalk: 0.16, pad: 0.22, trail: 0.26, vector: 0.22, label: 0.5 },
  locked: { glyph: 1, stalk: 0.75, pad: 0.8, trail: 1, vector: 0.9, label: 1 },
} as const;

function colorFor(contact: Aircraft, selected: boolean): number {
  const p = palette();
  if (contact.emergency) return rgbHex(p.emergency);
  if (contact.overhead) return rgbHex(p.sodium);
  return rgbHex(selected ? p.strike : p.phosphor);
}

/** Points round a circle in the horizontal plane. */
function ringPoints(radius: number, segments = 128): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return points;
}

/**
 * A disc with vertices all the way through it, so it can take ground heights.
 * UVs map to the disc's bounding square, matching the terrain raster: north
 * (−z) is v = 1, the top row of the canvas.
 */
function polarDiscGeometry(radius: number, rings: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  for (let ring = 1; ring <= rings; ring += 1) {
    const r = (ring / rings) * radius;
    for (let s = 0; s < segments; s += 1) {
      const angle = (s / segments) * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      positions.push(x, 0, z);
      uvs.push((x / radius + 1) / 2, (-z / radius + 1) / 2);
    }
  }
  const at = (ring: number, s: number) => (ring === 0 ? 0 : 1 + (ring - 1) * segments + (s % segments));
  for (let s = 0; s < segments; s += 1) indices.push(0, at(1, s + 1), at(1, s));
  for (let ring = 2; ring <= rings; ring += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a = at(ring - 1, s);
      const b = at(ring - 1, s + 1);
      const c = at(ring, s + 1);
      const d = at(ring, s);
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A line whose alpha is a vertex attribute, so a trail can fade toward its tail. */
function trailMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacity: { value: TIER.normal.trail },
    },
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(color, vAlpha * opacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

function textSprite(text: string, canvas: HTMLCanvasElement, color: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '500 32px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, 6, canvas.height / 2);
}

export default function HoloScope({
  aircraft,
  config,
  rangeNm,
  selectedHex,
  terrain,
  theme,
  pointRef,
  onSelect,
}: HoloScopeProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // The render loop reads live props without being torn down and rebuilt.
  const propsRef = useRef({ aircraft, config, rangeNm, selectedHex, terrain, onSelect });
  propsRef.current = { aircraft, config, rangeNm, selectedHex, terrain, onSelect };
  const pointTargetRef = useRef(pointRef);
  pointTargetRef.current = pointRef;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const themeColors = palette();
    // Disc, rings, spokes and the altitude ruler are structure, so they take the
    // neutral ink rather than the accent, which colorFor keeps for traffic.
    const FURNITURE = rgbHex(themeColors.inkDim);
    const SODIUM = rgbHex(themeColors.sodium);
    const STRIKE = rgbHex(themeColors.strike);
    const voidColor = rgbHex(themeColors.void);
    const inkDimCss = `rgba(${themeColors.inkDim.join(',')},0.95)`;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      host.dataset.webgl = 'failed';
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    // setSize is called with updateStyle=false, so the CSS size is ours to set:
    // the canvas fills its host and the drawing buffer follows in device pixels.
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(voidColor, DISC_UNITS * 1.9, DISC_UNITS * 4.4);

    // Light exists only so relief has shading; on flat ground it sums to the
    // same brightness the unlit disc had.
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.45);
    sun.position.set(-DISC_UNITS, DISC_UNITS * 1.2, -DISC_UNITS * 0.7);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
    camera.position.set(0, DISC_UNITS * 1.32, DISC_UNITS * 1.62);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, CEILING_UNITS * 0.2, 0);
    controls.minDistance = DISC_UNITS * 0.75;
    controls.maxDistance = DISC_UNITS * 3.6;
    // Stop the camera dropping under the projector plane.
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.enablePan = false;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.28;
    // Any deliberate look-around stops the drift; it resumes after a pause.
    let idleTimer: number | undefined;
    const onInteract = () => {
      controls.autoRotate = false;
      if (idleTimer) window.clearTimeout(idleTimer);
      if (!reduceMotion) {
        idleTimer = window.setTimeout(() => {
          controls.autoRotate = true;
        }, 6000);
      }
    };
    controls.addEventListener('start', onInteract);

    // ---- vertical datum ---------------------------------------------------
    // With terrain on, the disc is the ground under the site rather than sea
    // level: heights come off the elevation raster, the site's own elevation
    // is the zero plane, and everything in the scene — aircraft, the ruler,
    // the alert ceiling — is measured from it. The ruler keeps reading MSL,
    // so a flight level still lands where the label says.
    const raster = new TerrainRaster(1024);
    const elevation = raster.elevation;
    let reliefVersion = -1;
    let relief = false;
    let datumFt = 0;

    const heightUnits = (ft: number) => ((ft - datumFt) / CEILING_FT) * CEILING_UNITS;

    /** The ground's height at a scene position, in scene units. */
    const surfaceY = (x: number, z: number): number => {
      if (!relief) return 0;
      const u = (x / DISC_UNITS + 1) / 2;
      const v = (-z / DISC_UNITS + 1) / 2;
      return heightUnits(elevation.heightAt(u, v) * FT_PER_M);
    };

    /** Lay points on the ground, a hair above it so they are not swallowed. */
    const drape = (points: THREE.Vector3[]): THREE.Vector3[] => {
      for (const point of points) point.y = surfaceY(point.x, point.z) + 0.15;
      return points;
    };

    // ---- static furniture -------------------------------------------------
    const furniture = new THREE.Group();
    scene.add(furniture);

    const discMaterial = new THREE.LineBasicMaterial({
      color: FURNITURE,
      transparent: true,
      opacity: 0.6,
    });
    const innerMaterial = new THREE.LineBasicMaterial({
      color: FURNITURE,
      transparent: true,
      opacity: 0.22,
    });
    const spokeMaterial = new THREE.LineBasicMaterial({
      color: FURNITURE,
      transparent: true,
      opacity: 0.12,
    });
    const cardinalMaterial = new THREE.LineBasicMaterial({
      color: FURNITURE,
      transparent: true,
      opacity: 0.34,
    });

    /** Rings, spokes and ring labels, rebuilt whenever the range or the ground changes. */
    let lines = new THREE.Group();
    furniture.add(lines);
    const buildFurniture = (range: number) => {
      lines.removeFromParent();
      lines.traverse((node) => {
        if (node instanceof THREE.Line) node.geometry.dispose();
        if (node instanceof THREE.Sprite) {
          node.material.map?.dispose();
          node.material.dispose();
        }
      });
      lines = new THREE.Group();

      lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(drape(ringPoints(DISC_UNITS))), discMaterial));
      const scale = unitsPerNm(range);
      // Distance on each ring, on the 045 radial, out of the way of most traffic.
      const radial = Math.PI / 4;
      for (const radiusNm of ringRadii(range)) {
        const r = radiusNm * scale;
        lines.add(
          new THREE.Line(new THREE.BufferGeometry().setFromPoints(drape(ringPoints(r))), innerMaterial),
        );
        const label = makeLabel(String(radiusNm), inkDimCss, 9, false);
        const x = Math.sin(radial) * r;
        const z = -Math.cos(radial) * r;
        label.position.set(x + 1, surfaceY(x, z) + 1.2, z);
        lines.add(label);
      }

      // Bearing spokes every 30°, plus a brighter pair on the cardinals.
      for (let bearing = 0; bearing < 360; bearing += 30) {
        const radians = (bearing * Math.PI) / 180;
        const points: THREE.Vector3[] = [];
        for (let step = 0; step <= SPOKE_STEPS; step += 1) {
          const r = (step / SPOKE_STEPS) * DISC_UNITS;
          points.push(new THREE.Vector3(Math.sin(radians) * r, 0, -Math.cos(radians) * r));
        }
        lines.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(drape(points)),
            bearing % 90 === 0 ? cardinalMaterial : spokeMaterial,
          ),
        );
      }
      furniture.add(lines);
    };

    // ---- altitude ruler ---------------------------------------------------
    const ruler = new THREE.Group();
    furniture.add(ruler);
    const rulerAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, CEILING_UNITS, 0),
      ]),
      new THREE.LineBasicMaterial({ color: FURNITURE, transparent: true, opacity: 0.3 }),
    );
    ruler.add(rulerAxis);

    const labelSprites: THREE.Sprite[] = [];
    /** A text sprite. Static labels are tracked for disposal at teardown;
     *  ones that are rebuilt with the furniture are disposed with it. */
    const makeLabel = (text: string, color: string, px: number, permanent = true) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      textSprite(text, canvas, color);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
      );
      sprite.scale.set(px, px / 4, 1);
      sprite.center.set(0, 0.5);
      if (permanent) labelSprites.push(sprite);
      return sprite;
    };

    const ticks: Array<{ ft: number; tick: THREE.Line; label: THREE.Sprite }> = [];
    for (const { ft, label: text } of altitudeTicks()) {
      const tick = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-3.5, 0, 0),
          new THREE.Vector3(3.5, 0, 0),
        ]),
        new THREE.LineBasicMaterial({ color: FURNITURE, transparent: true, opacity: 0.38 }),
      );
      const label = makeLabel(text, inkDimCss, 15);
      ruler.add(tick, label);
      ticks.push({ ft, tick, label });
    }

    /** Flight levels sit at their MSL height above the datum; any below ground vanish. */
    const placeRuler = () => {
      const top = heightUnits(CEILING_FT);
      const axis = rulerAxis.geometry.attributes.position as THREE.BufferAttribute;
      axis.setY(1, Math.max(1, top));
      axis.needsUpdate = true;
      for (const { ft, tick, label } of ticks) {
        const y = heightUnits(ft);
        const shown = y > 1.5;
        tick.visible = shown;
        label.visible = shown;
        tick.position.y = y;
        label.position.set(5, y, 0);
      }
    };

    // Cardinal letters sitting just outside the disc.
    const cardinals: Array<[string, number, number]> = [
      ['N', 0, -1],
      ['E', 1, 0],
      ['S', 0, 1],
      ['W', -1, 0],
    ];
    for (const [letter, x, z] of cardinals) {
      const label = makeLabel(letter, inkDimCss, 14);
      label.position.set(x * DISC_UNITS * 1.06, 1.5, z * DISC_UNITS * 1.06);
      label.center.set(0.5, 0.5);
      furniture.add(label);
    }
    // Bearings every 30° between them, the way a compass rose is read, so a
    // position call like "zero-six-zero" lands somewhere on the disc.
    for (let bearing = 30; bearing < 360; bearing += 30) {
      if (bearing % 90 === 0) continue;
      const radians = (bearing * Math.PI) / 180;
      const label = makeLabel(String(bearing).padStart(3, '0'), inkDimCss, 10);
      label.position.set(
        Math.sin(radians) * DISC_UNITS * 1.06,
        1.5,
        -Math.cos(radians) * DISC_UNITS * 1.06,
      );
      label.center.set(0.5, 0.5);
      furniture.add(label);
    }

    // ---- terrain disc -----------------------------------------------------
    // The map lands on the disc through UVs that cover its bounding square,
    // which is exactly what the raster covers. The same UVs read the heights.
    // It sits a hair below zero so the range rings stay crisply on top of it.
    const terrainTexture = new THREE.CanvasTexture(raster.canvas);
    terrainTexture.colorSpace = THREE.SRGBColorSpace;
    const discGeometry = polarDiscGeometry(DISC_UNITS, RELIEF_RINGS, RELIEF_SEGMENTS);
    const terrainDisc = new THREE.Mesh(
      discGeometry,
      new THREE.MeshLambertMaterial({
        map: terrainTexture,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    terrainDisc.position.y = -0.12;
    terrainDisc.visible = false;
    scene.add(terrainDisc);

    let terrainVersion = -1;

    /** Lift every vertex to its ground height, or lay the disc flat again. */
    const applyRelief = () => {
      const positions = discGeometry.attributes.position as THREE.BufferAttribute;
      const uvs = discGeometry.attributes.uv as THREE.BufferAttribute;
      let lowest = Infinity;
      let highest = -Infinity;
      for (let i = 0; i < positions.count; i += 1) {
        const y = relief ? heightUnits(elevation.heightAt(uvs.getX(i), uvs.getY(i)) * FT_PER_M) : 0;
        positions.setY(i, y);
        lowest = Math.min(lowest, y);
        highest = Math.max(highest, y);
      }
      positions.needsUpdate = true;
      discGeometry.computeVertexNormals();
      discGeometry.computeBoundingSphere();
      // Readable from devtools, and the one place the datum is stated in words.
      host.dataset.relief = relief
        ? `datum ${Math.round(datumFt)} ft, ground ${lowest.toFixed(1)} to ${highest.toFixed(1)} units`
        : 'flat';
    };

    // ---- alert volume -----------------------------------------------------
    // A drum standing on the disc: the radius is the alert radius, the lid is
    // the alert ceiling, so "close and low" is a shape you can see.
    const alertGroup = new THREE.Group();
    scene.add(alertGroup);
    const alertWall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 64, 1, true),
      new THREE.MeshBasicMaterial({
        color: SODIUM,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    alertGroup.add(alertWall);
    const alertEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true)),
      new THREE.LineBasicMaterial({ color: SODIUM, transparent: true, opacity: 0.5 }),
    );
    alertGroup.add(alertEdge);

    const shapeAlertVolume = (radiusNm: number, ceilingFt: number, range: number) => {
      const radius = Math.max(0.4, radiusNm * unitsPerNm(range));
      const height = Math.max(0.6, heightUnits(ceilingFt));
      for (const node of [alertWall, alertEdge]) {
        node.scale.set(radius, height, radius);
        node.position.y = height / 2;
      }
    };

    // ---- lock reticle -----------------------------------------------------
    // One ring, parked on whichever glyph is locked, breathing slowly so the
    // eye finds it among a hundred others without it shouting.
    const reticle = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPoints(GLYPH_UNITS * 0.85, 64)),
      new THREE.LineBasicMaterial({ color: STRIKE, transparent: true, opacity: 0.7 }),
    );
    reticle.visible = false;
    scene.add(reticle);

    // ---- contacts ---------------------------------------------------------
    const contacts = new Map<string, Contact>();
    const fleet = new THREE.Group();
    scene.add(fleet);

    const glyphGeometry = new THREE.PlaneGeometry(GLYPH_UNITS, GLYPH_UNITS);
    const padGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints(2.6, 24));
    const textureCache = new Map<string, THREE.CanvasTexture>();

    /** Tinted icon textures, keyed by icon and colour, shared across contacts. */
    const iconTexture = (icon: string, color: number): THREE.CanvasTexture | null => {
      const key = `${icon}|${color}`;
      const cached = textureCache.get(key);
      if (cached) return cached;
      const rgb: [number, number, number] = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
      const canvas = getAircraftSprite(icon, SPRITE_PX, rgb);
      if (!canvas) return null;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(key, texture);
      return texture;
    };

    const disposeContact = (contact: Contact) => {
      contact.group.removeFromParent();
      contact.glyph.material.dispose();
      contact.stalk.geometry.dispose();
      contact.stalk.material.dispose();
      contact.pad.material.dispose();
      contact.trail.geometry.dispose();
      contact.trail.material.dispose();
      contact.vector.geometry.dispose();
      contact.vectorSolid.dispose();
      contact.vectorDashed.dispose();
      contact.labelTexture.dispose();
      contact.label.material.dispose();
    };

    const createContact = (hex: string): Contact => {
      const group = new THREE.Group();
      group.userData.hex = hex;

      const pivot = new THREE.Group();
      group.add(pivot);

      const glyph = new THREE.Mesh(
        glyphGeometry,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      glyph.rotation.x = -Math.PI / 2;
      glyph.userData.hex = hex;
      pivot.add(glyph);

      const stalk = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4 }),
      );
      group.add(stalk);

      const pad = new THREE.Line(padGeometry, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 }));
      group.add(pad);

      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 3), 3),
      );
      trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_POINTS), 1));
      trailGeometry.setDrawRange(0, 0);
      const trail = new THREE.Line(trailGeometry, trailMaterial(0xffffff));
      trail.frustumCulled = false;
      trail.visible = false;
      group.add(trail);

      const vectorSolid = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 });
      const vectorDashed = new THREE.LineDashedMaterial({
        transparent: true,
        opacity: 0.9,
        dashSize: 1.8,
        gapSize: 1.1,
      });
      const vector = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        vectorSolid,
      );
      vector.frustumCulled = false;
      vector.visible = false;
      group.add(vector);

      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 256;
      labelCanvas.height = 64;
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      labelTexture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false }),
      );
      label.scale.set(13, 3.25, 1);
      label.center.set(0, 0.5);
      group.add(label);

      const contact: Contact = {
        group,
        pivot,
        glyph,
        stalk,
        pad,
        trail,
        vector,
        vectorSolid,
        vectorDashed,
        label,
        labelTexture,
        labelCanvas,
        iconKey: '',
        labelKey: '',
        trailKey: '',
      };
      contacts.set(hex, contact);
      fleet.add(group);
      return contact;
    };

    const syncContacts = () => {
      const { aircraft: live, rangeNm: range, selectedHex: locked, config: site } = propsRef.current;
      const seen = new Set<string>();
      const anyLocked = locked !== null && live.some((item) => item.hex === locked);

      for (const item of live) {
        seen.add(item.hex);
        const selected = item.hex === locked;
        const tier = selected ? TIER.locked : anyLocked ? TIER.dim : TIER.normal;
        const color = colorFor(item, selected);
        const icon = iconForAircraft(item);
        const [x, z] = groundPosition(item.distanceNm, item.bearingDeg, range);
        // The group stands on the ground; everything in it is measured up from there.
        const ground = surfaceY(x, z);
        const lift =
          item.onGround || item.altitude === null
            ? 0
            : Math.max(0, heightUnits(item.altitude) - ground);

        const contact = contacts.get(item.hex) ?? createContact(item.hex);

        // The glyph rides at altitude; the stalk and pad stay on the ground,
        // which is what makes the height readable. Only the pivot carries the
        // heading, so a turning aircraft does not swing its own stalk around.
        contact.group.position.set(x, ground, z);
        contact.glyph.position.y = lift;
        contact.pivot.rotation.y = -((item.track ?? 0) * Math.PI) / 180;

        const stalkPoints = contact.stalk.geometry.attributes.position as THREE.BufferAttribute;
        stalkPoints.setXYZ(0, 0, 0, 0);
        stalkPoints.setXYZ(1, 0, lift, 0);
        stalkPoints.needsUpdate = true;

        const iconKey = `${icon}|${color}`;
        if (contact.iconKey !== iconKey) {
          const texture = iconTexture(icon, color);
          if (texture) {
            contact.glyph.material.map = texture;
            contact.glyph.material.needsUpdate = true;
            contact.iconKey = iconKey;
          }
        }

        const hex = `#${color.toString(16).padStart(6, '0')}`;
        contact.stalk.material.color.setHex(color);
        contact.pad.material.color.setHex(color);
        contact.vectorSolid.color.setHex(color);
        contact.vectorDashed.color.setHex(color);
        (contact.trail.material.uniforms.color!.value as THREE.Color).setHex(color);
        contact.glyph.material.opacity = tier.glyph;
        contact.stalk.material.opacity = tier.stalk;
        contact.pad.material.opacity = tier.pad;
        contact.trail.material.uniforms.opacity!.value = tier.trail;
        contact.vectorSolid.opacity = tier.vector;
        contact.vectorDashed.opacity = tier.vector;
        contact.label.material.opacity = tier.label;

        // Trail: the receiver's history, laid out in the scene and draped on
        // the ground where it touches it. Rebuilt only when the history, the
        // range or the ground actually changed, not every frame.
        const last = item.trail[item.trail.length - 1];
        const trailKey = `${item.trail.length}|${last?.t ?? 0}|${range}|${relief}|${reliefVersion}|${datumFt}`;
        if (site && contact.trailKey !== trailKey) {
          const positions = contact.trail.geometry.attributes.position as THREE.BufferAttribute;
          const alphas = contact.trail.geometry.attributes.alpha as THREE.BufferAttribute;
          const points = item.trail.slice(-(MAX_TRAIL_POINTS - 1));
          let n = 0;
          for (let i = 0; i < points.length; i += 1) {
            const point = points[i]!;
            const rel = relative(site.lat, site.lon, point.lat, point.lon);
            if (rel.distance > range) continue;
            const [px, pz] = groundPosition(rel.distance, rel.bearing, range);
            const pg = surfaceY(px, pz);
            const py = point.alt === null ? pg : Math.max(pg, heightUnits(point.alt));
            positions.setXYZ(n, px - x, py - ground, pz - z);
            alphas.setX(n, 0.06 + 0.94 * (i / points.length));
            n += 1;
          }
          positions.setXYZ(n, 0, lift, 0);
          alphas.setX(n, 1);
          n += 1;
          positions.needsUpdate = true;
          alphas.needsUpdate = true;
          contact.trail.geometry.setDrawRange(0, n);
          contact.trail.visible = n >= 2;
          contact.trailKey = trailKey;
        }

        // Vector: one minute of travel at the current speed, heading and
        // vertical rate, so a descending aircraft's line points at the ground.
        const showVector =
          !item.onGround && item.track !== null && item.groundSpeed !== null && item.groundSpeed >= 30;
        contact.vector.visible = showVector;
        if (showVector) {
          const minuteUnits = Math.max(1.5, ((item.groundSpeed as number) / 60) * unitsPerNm(range));
          const radians = ((item.track as number) * Math.PI) / 180;
          const climbUnits = ((item.verticalRate ?? 0) / CEILING_FT) * CEILING_UNITS;
          const vectorPoints = contact.vector.geometry.attributes.position as THREE.BufferAttribute;
          vectorPoints.setXYZ(0, 0, lift, 0);
          vectorPoints.setXYZ(
            1,
            Math.sin(radians) * minuteUnits,
            Math.max(0, lift + climbUnits),
            -Math.cos(radians) * minuteUnits,
          );
          vectorPoints.needsUpdate = true;
          const material = selected ? contact.vectorDashed : contact.vectorSolid;
          if (contact.vector.material !== material) contact.vector.material = material;
          if (selected) contact.vector.computeLineDistances();
        }

        const name = (item.flight ?? item.hex).trim() || item.hex;
        const altitude = item.altitude === null ? '—' : `${Math.round(item.altitude / 100)}`;
        const labelKey = `${name}|${altitude}|${hex}`;
        if (contact.labelKey !== labelKey) {
          textSprite(`${name}  ${altitude}`, contact.labelCanvas, hex);
          contact.labelTexture.needsUpdate = true;
          contact.labelKey = labelKey;
        }
        // Sits beside the glyph, clear of the stalk.
        contact.label.position.set(0, lift + 4, 0);
      }

      for (const [hex, contact] of contacts) {
        if (!seen.has(hex)) {
          disposeContact(contact);
          contacts.delete(hex);
        }
      }
    };

    // ---- picking ----------------------------------------------------------
    const projected = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!downAt) return;
      const travelled = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      downAt = null;
      // A drag is a camera move, not a selection.
      if (travelled > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(fleet.children, true);
      const hit = hits.find((entry) => entry.object.userData.hex);
      propsRef.current.onSelect((hit?.object.userData.hex as string | undefined) ?? null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ---- resize -----------------------------------------------------------
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(240, rect.width);
      const height = Math.max(240, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // ---- loop -------------------------------------------------------------
    let frame = 0;
    let lastRange = -1;
    let lastAlert = '';
    const startedAt = performance.now();

    const render = () => {
      frame = requestAnimationFrame(render);
      const { rangeNm: range, config: site, terrain: terrainId } = propsRef.current;
      let groundChanged = false;

      if (site) {
        if (terrainId === TERRAIN_NONE) {
          terrainDisc.visible = false;
          if (relief || datumFt !== 0) {
            // Without a map there is no ground to stand on; back to sea level.
            relief = false;
            datumFt = 0;
            groundChanged = true;
          }
        } else {
          raster.configure(site.lat, site.lon, range * 2, terrainId, activeThemeId());
          terrainDisc.visible = raster.ready;
          if (raster.version !== terrainVersion) {
            terrainTexture.needsUpdate = true;
            terrainVersion = raster.version;
          }
          elevation.configure(site.lat, site.lon, range * 2);
          if (elevation.version !== reliefVersion) {
            reliefVersion = elevation.version;
            relief = elevation.ready;
            // The datum is the site's own elevation, which a range change
            // does not alter, so it holds steady while new tiles load.
            if (relief) datumFt = elevation.siteHeight * FT_PER_M;
            groundChanged = true;
          }
        }
      }

      if (range !== lastRange || groundChanged) {
        buildFurniture(range);
        placeRuler();
        applyRelief();
        lastRange = range;
        lastAlert = '';
      }
      if (site) {
        const key = `${site.alertRadiusNm}|${site.alertAltitudeFt}|${range}`;
        if (key !== lastAlert) {
          shapeAlertVolume(site.alertRadiusNm, site.alertAltitudeFt, range);
          lastAlert = key;
        }
      }

      syncContacts();

      // The reticle rides the locked glyph and breathes, unless motion is off.
      const locked = propsRef.current.selectedHex;
      const tracked = locked ? contacts.get(locked) : undefined;
      reticle.visible = tracked !== undefined;
      if (tracked) {
        reticle.position.set(
          tracked.group.position.x,
          tracked.group.position.y + tracked.glyph.position.y,
          tracked.group.position.z,
        );
        const breath = reduceMotion ? 0 : Math.sin((performance.now() - startedAt) / 450);
        const scale = 1 + 0.08 * breath;
        reticle.scale.set(scale, 1, scale);
        reticle.material.opacity = 0.62 + 0.22 * breath;
      }

      controls.update();
      renderer.render(scene, camera);

      // Project the locked glyph into CSS pixels for the callout to follow.
      const target = pointTargetRef.current.current;
      if (target && tracked) {
        projected.setFromMatrixPosition(tracked.glyph.matrixWorld);
        projected.project(camera);
        const rect = host.getBoundingClientRect();
        pointTargetRef.current.current = {
          x: ((projected.x + 1) / 2) * rect.width,
          y: ((1 - projected.y) / 2) * rect.height,
          // z beyond 1 means the point sits behind the camera.
          visible: projected.z < 1,
        };
      } else if (target?.visible) {
        pointTargetRef.current.current = { x: 0, y: 0, visible: false };
      }
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      if (idleTimer) window.clearTimeout(idleTimer);
      observer.disconnect();
      controls.removeEventListener('start', onInteract);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      for (const contact of contacts.values()) disposeContact(contact);
      contacts.clear();
      for (const texture of textureCache.values()) texture.dispose();
      for (const sprite of labelSprites) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
      glyphGeometry.dispose();
      padGeometry.dispose();
      terrainTexture.dispose();
      terrainDisc.material.dispose();
      reticle.material.dispose();
      scene.traverse((node) => {
        if (node instanceof THREE.Line || node instanceof THREE.Mesh) {
          node.geometry.dispose();
        }
      });
      discMaterial.dispose();
      innerMaterial.dispose();
      spokeMaterial.dispose();
      cardinalMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // Materials bake in the palette, so a theme change rebuilds the scene.
  }, [theme]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="h-full w-full" />
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-micro text-ink-dim">
        Drag to orbit, scroll to zoom, click a contact to lock it
      </p>
    </div>
  );
}
