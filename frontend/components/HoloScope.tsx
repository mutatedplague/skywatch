'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { iconForAircraft } from '@/lib/aircraftIcons';
import {
  altitudeTicks,
  altitudeUnits,
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
  label: THREE.Sprite;
  labelTexture: THREE.CanvasTexture;
  labelCanvas: HTMLCanvasElement;
  iconKey: string;
  labelKey: string;
}

function colorFor(contact: Aircraft, selected: boolean): number {
  const p = palette();
  if (contact.emergency) return rgbHex(p.emergency);
  if (contact.overhead) return rgbHex(p.sodium);
  return rgbHex(selected ? p.strike : p.phosphor);
}

/** A ring of segments in the horizontal plane, as a line loop. */
function ringGeometry(radius: number, segments = 128): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
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

    const outerRing = new THREE.Line(ringGeometry(DISC_UNITS), discMaterial);
    furniture.add(outerRing);

    /** Range rings, rebuilt whenever the selected range changes. */
    let rings = new THREE.Group();
    furniture.add(rings);
    const buildRings = (range: number) => {
      rings.removeFromParent();
      rings.traverse((node) => {
        if (node instanceof THREE.Line) node.geometry.dispose();
      });
      rings = new THREE.Group();
      const scale = unitsPerNm(range);
      for (const radiusNm of ringRadii(range)) {
        rings.add(new THREE.Line(ringGeometry(radiusNm * scale), innerMaterial));
      }
      furniture.add(rings);
    };

    // Bearing spokes every 30°, plus a brighter pair on the cardinals.
    for (let bearing = 0; bearing < 360; bearing += 30) {
      const radians = (bearing * Math.PI) / 180;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.sin(radians) * DISC_UNITS, 0, -Math.cos(radians) * DISC_UNITS),
      ]);
      furniture.add(
        new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: FURNITURE,
            transparent: true,
            opacity: bearing % 90 === 0 ? 0.34 : 0.12,
          }),
        ),
      );
    }

    // ---- altitude ruler ---------------------------------------------------
    const ruler = new THREE.Group();
    furniture.add(ruler);
    ruler.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, CEILING_UNITS, 0),
        ]),
        new THREE.LineBasicMaterial({ color: FURNITURE, transparent: true, opacity: 0.3 }),
      ),
    );

    const labelSprites: THREE.Sprite[] = [];
    const makeLabel = (text: string, color: string, px: number) => {
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
      labelSprites.push(sprite);
      return sprite;
    };

    for (const tick of altitudeTicks()) {
      const y = altitudeUnits(tick.ft);
      ruler.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-3.5, y, 0),
            new THREE.Vector3(3.5, y, 0),
          ]),
          new THREE.LineBasicMaterial({ color: FURNITURE, transparent: true, opacity: 0.38 }),
        ),
      );
      const label = makeLabel(tick.label, inkDimCss, 15);
      label.position.set(5, y, 0);
      ruler.add(label);
    }

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

    // ---- terrain disc -----------------------------------------------------
    // CircleGeometry's UVs map to its own bounding square, which is exactly what
    // the raster covers, so the map lands on the disc with no extra maths. It
    // sits a hair below zero so the range rings stay crisply on top of it.
    const raster = new TerrainRaster(1024);
    const terrainTexture = new THREE.CanvasTexture(raster.canvas);
    terrainTexture.colorSpace = THREE.SRGBColorSpace;
    const terrainDisc = new THREE.Mesh(
      new THREE.CircleGeometry(DISC_UNITS, 128),
      new THREE.MeshBasicMaterial({
        map: terrainTexture,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    terrainDisc.rotation.x = -Math.PI / 2;
    terrainDisc.position.y = -0.12;
    terrainDisc.visible = false;
    scene.add(terrainDisc);

    let terrainVersion = -1;

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
      const height = Math.max(0.6, altitudeUnits(ceilingFt));
      for (const node of [alertWall, alertEdge]) {
        node.scale.set(radius, height, radius);
        node.position.y = height / 2;
      }
    };

    // ---- contacts ---------------------------------------------------------
    const contacts = new Map<string, Contact>();
    const fleet = new THREE.Group();
    scene.add(fleet);

    const glyphGeometry = new THREE.PlaneGeometry(GLYPH_UNITS, GLYPH_UNITS);
    const padGeometry = ringGeometry(2.6, 24);
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
      contact.labelTexture.dispose();
      contact.label.material.dispose();
    };

    const syncContacts = () => {
      const { aircraft: live, rangeNm: range, selectedHex: locked } = propsRef.current;
      const seen = new Set<string>();

      for (const item of live) {
        seen.add(item.hex);
        const selected = item.hex === locked;
        const color = colorFor(item, selected);
        const icon = iconForAircraft(item);
        const [x, z] = groundPosition(item.distanceNm, item.bearingDeg, range);
        const y = altitudeUnits(item.altitude);

        let contact = contacts.get(item.hex);
        if (!contact) {
          const group = new THREE.Group();
          group.userData.hex = item.hex;

          const pivot = new THREE.Group();
          group.add(pivot);

          const glyph = new THREE.Mesh(
            glyphGeometry,
            new THREE.MeshBasicMaterial({
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );
          glyph.rotation.x = -Math.PI / 2;
          glyph.userData.hex = item.hex;
          pivot.add(glyph);

          const stalk = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, 0, 0),
            ]),
            new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4 }),
          );
          group.add(stalk);

          const pad = new THREE.Line(
            padGeometry,
            new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 }),
          );
          group.add(pad);

          const labelCanvas = document.createElement('canvas');
          labelCanvas.width = 256;
          labelCanvas.height = 64;
          const labelTexture = new THREE.CanvasTexture(labelCanvas);
          labelTexture.colorSpace = THREE.SRGBColorSpace;
          const label = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: labelTexture,
              transparent: true,
              depthWrite: false,
            }),
          );
          label.scale.set(13, 3.25, 1);
          label.center.set(0, 0.5);
          group.add(label);

          contact = {
            group,
            pivot,
            glyph,
            stalk,
            pad,
            label,
            labelTexture,
            labelCanvas,
            iconKey: '',
            labelKey: '',
          };
          contacts.set(item.hex, contact);
          fleet.add(group);
        }

        // The glyph rides at altitude; the stalk and pad stay on the disc, which
        // is what makes the height readable. Only the pivot carries the heading,
        // so a turning aircraft does not swing its own stalk around.
        contact.group.position.set(x, 0, z);
        contact.glyph.position.y = y;
        contact.pivot.rotation.y = -((item.track ?? 0) * Math.PI) / 180;

        const stalkPoints = contact.stalk.geometry.attributes.position as THREE.BufferAttribute;
        stalkPoints.setXYZ(0, 0, 0, 0);
        stalkPoints.setXYZ(1, 0, y, 0);
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
        contact.glyph.material.opacity = selected ? 1 : 0.92;
        contact.stalk.material.opacity = selected ? 0.75 : 0.34;
        contact.pad.material.opacity = selected ? 0.8 : 0.4;

        const name = (item.flight ?? item.hex).trim() || item.hex;
        const altitude = item.altitude === null ? '—' : `${Math.round(item.altitude / 100)}`;
        const labelKey = `${name}|${altitude}|${hex}`;
        if (contact.labelKey !== labelKey) {
          textSprite(`${name}  ${altitude}`, contact.labelCanvas, hex);
          contact.labelTexture.needsUpdate = true;
          contact.labelKey = labelKey;
        }
        // Sits beside the glyph, clear of the stalk.
        contact.label.position.set(0, y + 4, 0);
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

    const render = () => {
      frame = requestAnimationFrame(render);
      const { rangeNm: range, config: site } = propsRef.current;

      if (range !== lastRange) {
        buildRings(range);
        lastRange = range;
        lastAlert = '';
      }
      if (site) {
        const key = `${site.alertRadiusNm}|${site.alertAltitudeFt}|${range}`;
        if (key !== lastAlert) {
          shapeAlertVolume(site.alertRadiusNm, site.alertAltitudeFt, range);
          lastAlert = key;
        }

        const { terrain: terrainId } = propsRef.current;
        if (terrainId === TERRAIN_NONE) {
          terrainDisc.visible = false;
        } else {
          raster.configure(site.lat, site.lon, range * 2, terrainId, activeThemeId());
          terrainDisc.visible = raster.ready;
          if (raster.version !== terrainVersion) {
            terrainTexture.needsUpdate = true;
            terrainVersion = raster.version;
          }
        }
      }

      syncContacts();
      controls.update();
      renderer.render(scene, camera);

      // Project the locked glyph into CSS pixels for the callout to follow.
      const target = pointTargetRef.current.current;
      const locked = propsRef.current.selectedHex;
      const tracked = locked ? contacts.get(locked) : undefined;
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
      scene.traverse((node) => {
        if (node instanceof THREE.Line || node instanceof THREE.Mesh) {
          node.geometry.dispose();
        }
      });
      discMaterial.dispose();
      innerMaterial.dispose();
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
