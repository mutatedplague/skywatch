import type { Config } from '../config.js';
import { destination, distanceNm } from '../geo.js';
import type { RawAircraft } from '../types.js';
import type { AdsbSource, SourceResult } from './index.js';

/**
 * Synthetic traffic, so the scope has something to draw before a real feed is
 * configured. Aircraft fly straight-line tracks across the scope, climb or
 * descend toward a target altitude, and respawn at the edge when they leave.
 */

type Profile = 'heavy' | 'jet' | 'regional' | 'ga' | 'rotor';

const AIRLINES = ['DAL', 'AAL', 'UAL', 'SWA', 'UPS', 'FDX', 'JBU', 'ASA', 'SKW', 'ACA'];
const TYPES: Record<Profile, string[]> = {
  heavy: ['B77W', 'B789', 'A359', 'B763', 'A333'],
  jet: ['B738', 'A20N', 'B739', 'A321', 'B38M'],
  regional: ['E75L', 'CRJ9', 'DH8D', 'E145'],
  ga: ['C172', 'PA28', 'SR22', 'BE36', 'C182'],
  rotor: ['EC35', 'AS50', 'R44', 'B407'],
};
const ALT_BAND: Record<Profile, [number, number]> = {
  heavy: [33000, 41000],
  jet: [28000, 38000],
  regional: [16000, 27000],
  ga: [2500, 9500],
  rotor: [700, 1800],
};
const SPEED_BAND: Record<Profile, [number, number]> = {
  heavy: [450, 510],
  jet: [400, 470],
  regional: [280, 380],
  ga: [105, 165],
  rotor: [75, 125],
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;

interface SimAircraft {
  hex: string;
  flight: string;
  registration: string | null;
  type: string;
  profile: Profile;
  lat: number;
  lon: number;
  altitude: number;
  targetAltitude: number;
  groundSpeed: number;
  track: number;
  turnRate: number;
  squawk: string;
  emergencyUntil: number;
  military: boolean;
}

function hexId(): string {
  return Math.floor(rand(0xa00000, 0xaffff0))
    .toString(16)
    .padStart(6, '0');
}

function tailNumber(): string {
  const digits = Math.floor(rand(100, 999));
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return `N${digits}${pick(letters.split(''))}${pick(letters.split(''))}`;
}

export function demoSource(config: Config): AdsbSource {
  const fleet = new Map<string, SimAircraft>();
  let lastTick = Date.now();
  let messages = 0;

  /** Spawn at the scope edge on a track that crosses somewhere near the site. */
  function spawn(profile: Profile, overhead = false): SimAircraft {
    const spawnBearing = rand(0, 360);
    const edge = destination(config.lat, config.lon, spawnBearing, config.rangeNm * rand(0.75, 1.02));
    const inbound = (spawnBearing + 180) % 360;
    // A wide offset sends traffic past the site; a tight one sends it overhead.
    const offset = overhead ? rand(-1.5, 1.5) : rand(-38, 38);
    const [altMin, altMax] = ALT_BAND[profile];
    const [spdMin, spdMax] = SPEED_BAND[profile];
    const altitude = overhead ? rand(1200, 6500) : rand(altMin, altMax);
    const isTail = profile === 'ga' || profile === 'rotor';

    return {
      hex: hexId(),
      flight: isTail ? tailNumber() : `${pick(AIRLINES)}${Math.floor(rand(100, 2999))}`,
      registration: isTail ? null : tailNumber(),
      type: pick(TYPES[profile]),
      profile,
      lat: edge.lat,
      lon: edge.lon,
      altitude,
      targetAltitude: Math.max(700, altitude + rand(-4000, 4000)),
      groundSpeed: rand(spdMin, spdMax),
      track: (inbound + offset + 360) % 360,
      turnRate: profile === 'rotor' ? rand(-2.5, 2.5) : rand(-0.08, 0.08),
      squawk: String(Math.floor(rand(1000, 7000))).padStart(4, '0'),
      emergencyUntil: 0,
      military: Math.random() < 0.05,
    };
  }

  const MIX: Profile[] = ['heavy', 'jet', 'jet', 'jet', 'regional', 'regional', 'ga', 'ga', 'rotor'];
  for (let i = 0; i < 18; i += 1) {
    const aircraft = spawn(pick(MIX));
    // Scatter the initial fleet across the scope instead of ringing the edge.
    const scatter = destination(config.lat, config.lon, rand(0, 360), rand(0, config.rangeNm * 0.9));
    aircraft.lat = scatter.lat;
    aircraft.lon = scatter.lon;
    fleet.set(aircraft.hex, aircraft);
  }
  // One guaranteed low pass so the overhead alert has something to trigger on.
  const closePass = spawn('ga', true);
  fleet.set(closePass.hex, closePass);

  function step(dtSeconds: number) {
    const now = Date.now();
    for (const aircraft of [...fleet.values()]) {
      aircraft.track = (aircraft.track + aircraft.turnRate * dtSeconds + 360) % 360;

      const travelled = (aircraft.groundSpeed / 3600) * dtSeconds;
      const next = destination(aircraft.lat, aircraft.lon, aircraft.track, travelled);
      aircraft.lat = next.lat;
      aircraft.lon = next.lon;

      const altDelta = aircraft.targetAltitude - aircraft.altitude;
      if (Math.abs(altDelta) > 50) {
        const rate = Math.min(Math.abs(altDelta), 1800 * (dtSeconds / 60));
        aircraft.altitude += Math.sign(altDelta) * rate;
      } else if (Math.random() < 0.002) {
        const [altMin, altMax] = ALT_BAND[aircraft.profile];
        aircraft.targetAltitude = rand(altMin, altMax);
      }

      if (aircraft.emergencyUntil && now > aircraft.emergencyUntil) {
        aircraft.emergencyUntil = 0;
        aircraft.squawk = String(Math.floor(rand(1000, 7000))).padStart(4, '0');
      } else if (!aircraft.emergencyUntil && Math.random() < 0.00015) {
        aircraft.squawk = pick(['7700', '7600']);
        aircraft.emergencyUntil = now + 90_000;
      }

      messages += 1;

      const out = distanceNm(config.lat, config.lon, aircraft.lat, aircraft.lon);
      if (out > config.rangeNm * 1.08) {
        fleet.delete(aircraft.hex);
        const replacement = spawn(pick(MIX), Math.random() < 0.18);
        fleet.set(replacement.hex, replacement);
      }
    }
  }

  return {
    name: 'demo',
    label: 'SIMULATED',
    async fetchAircraft(): Promise<SourceResult> {
      const now = Date.now();
      step(Math.min(5, (now - lastTick) / 1000));
      lastTick = now;

      const aircraft: RawAircraft[] = [...fleet.values()].map((sim) => ({
        hex: sim.hex,
        flight: sim.flight,
        registration: sim.registration,
        type: sim.type,
        lat: sim.lat,
        lon: sim.lon,
        altitude: Math.round(sim.altitude),
        altitudeGeom: Math.round(sim.altitude + 120),
        groundSpeed: Math.round(sim.groundSpeed),
        track: Math.round(sim.track),
        verticalRate: Math.round((sim.targetAltitude - sim.altitude) / 2),
        squawk: sim.squawk,
        category: sim.profile === 'rotor' ? 'A7' : sim.profile === 'ga' ? 'A1' : 'A3',
        onGround: false,
        rssi: -Math.round(rand(8, 28) + distanceNm(config.lat, config.lon, sim.lat, sim.lon) / 8),
        seen: rand(0, 1.5),
        military: sim.military,
      }));

      return { aircraft, messages };
    },
  };
}
