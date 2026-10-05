import type { Config } from './config.js';
import { bearingDeg, distanceNm } from './geo.js';
import type { Aircraft, RawAircraft, TrailPoint } from './types.js';

const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700']);
const MAX_TRAIL_POINTS = 90;
/** Don't record a trail point until the target has actually moved this far. */
const TRAIL_MIN_NM = 0.15;
const TRAIL_MIN_MS = 2500;

interface Track {
  aircraft: Aircraft;
  lastTrailAt: number;
}

/**
 * Holds every contact currently in the airspace, merges each poll into the
 * existing track, and drops contacts that stop reporting.
 */
export class Tracker {
  private readonly tracks = new Map<string, Track>();

  constructor(private readonly config: Config) {}

  update(reports: RawAircraft[], now = Date.now()): Aircraft[] {
    for (const report of reports) {
      const distance = distanceNm(this.config.lat, this.config.lon, report.lat, report.lon);
      // Public feeds return a bounding box, so trim anything outside our radius.
      if (distance > this.config.rangeNm) continue;

      const bearing = bearingDeg(this.config.lat, this.config.lon, report.lat, report.lon);
      const existing = this.tracks.get(report.hex);
      const trail: TrailPoint[] = existing ? existing.aircraft.trail : [];
      const lastTrailAt = existing?.lastTrailAt ?? 0;
      const lastPoint = trail[trail.length - 1];

      const movedFar =
        !lastPoint || distanceNm(lastPoint.lat, lastPoint.lon, report.lat, report.lon) >= TRAIL_MIN_NM;
      if (movedFar && now - lastTrailAt >= TRAIL_MIN_MS) {
        trail.push({ lat: report.lat, lon: report.lon, alt: report.altitude, t: now });
        if (trail.length > MAX_TRAIL_POINTS) trail.splice(0, trail.length - MAX_TRAIL_POINTS);
      }

      const aircraft: Aircraft = {
        ...report,
        // Feeds drop the callsign on some messages; keep the last one we saw.
        flight: report.flight ?? existing?.aircraft.flight ?? null,
        registration: report.registration ?? existing?.aircraft.registration ?? null,
        type: report.type ?? existing?.aircraft.type ?? null,
        distanceNm: distance,
        bearingDeg: bearing,
        firstSeen: existing?.aircraft.firstSeen ?? now,
        lastSeen: now,
        emergency: report.squawk !== null && EMERGENCY_SQUAWKS.has(report.squawk),
        // Taxiing aircraft are inside the volume at an airport site, but they
        // are not overhead anyone; only something flying can be.
        overhead:
          !report.onGround &&
          distance <= this.config.alertRadiusNm &&
          report.altitude !== null &&
          report.altitude <= this.config.alertAltitudeFt,
        trail,
      };

      this.tracks.set(report.hex, {
        aircraft,
        lastTrailAt: movedFar && now - lastTrailAt >= TRAIL_MIN_MS ? now : lastTrailAt,
      });
    }

    this.prune(now);
    return this.snapshot();
  }

  private prune(now: number) {
    const cutoff = this.config.staleSeconds * 1000;
    for (const [hex, track] of this.tracks) {
      if (now - track.aircraft.lastSeen > cutoff) this.tracks.delete(hex);
    }
  }

  /** Nearest contact first — the strip bay reads top-down by proximity. */
  snapshot(): Aircraft[] {
    return [...this.tracks.values()]
      .map((track) => track.aircraft)
      .sort((a, b) => a.distanceNm - b.distanceNm);
  }

  get size(): number {
    return this.tracks.size;
  }
}
