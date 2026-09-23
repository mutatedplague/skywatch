'use client';

import {
  altitudeFraction,
  compassPoint,
  displayName,
  formatAltitude,
  formatBearing,
  formatDistance,
  formatSpeed,
  verticalArrow,
} from '@/lib/format';
import type { Aircraft } from '@/lib/types';

interface FlightStripProps {
  aircraft: Aircraft;
  selected: boolean;
  onSelect: (hex: string) => void;
}

/**
 * One row of the contact table. The columns are fixed so callsigns, ranges and
 * altitudes line up down the list and can be compared by eye without reading
 * each one. Colour is state only: accent for ordinary traffic, amber inside the
 * alert volume, red for an emergency squawk.
 */
export default function FlightStrip({ aircraft, selected, onSelect }: FlightStripProps) {
  const state = aircraft.emergency ? 'emergency' : aircraft.overhead ? 'overhead' : 'normal';

  const mark =
    state === 'emergency'
      ? 'text-emergency'
      : state === 'overhead'
        ? 'text-sodium'
        : 'text-phosphor';

  return (
    <button
      type="button"
      onClick={() => onSelect(aircraft.hex)}
      aria-pressed={selected}
      className={`flex w-full items-stretch gap-3 border-b border-hairline px-6 py-2.5 text-left transition-colors ${
        selected ? 'bg-console' : 'hover:bg-console/60'
      }`}
    >
      <AltitudeGauge altitude={aircraft.altitude} state={state} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`data text-mid font-medium ${selected ? 'text-ink' : mark}`}>
            {displayName(aircraft)}
          </span>
          {aircraft.type ? (
            <span className="data text-micro text-ink-dim">{aircraft.type}</span>
          ) : null}
          {aircraft.military ? (
            <span className="text-micro text-ink-dim">Military</span>
          ) : null}
        </div>
        <div className="mt-1 flex items-baseline gap-4 text-micro text-ink-dim">
          <span className="data">
            {formatBearing(aircraft.bearingDeg)}° {compassPoint(aircraft.bearingDeg)}
          </span>
          {aircraft.squawk ? <span className="data">Squawk {aircraft.squawk}</span> : null}
        </div>
      </div>

      <div className="w-20 shrink-0 text-right">
        <div className="data text-base text-ink">
          {formatDistance(aircraft.distanceNm)}
          <span className="ml-1 text-micro text-ink-dim">nm</span>
        </div>
        <div className="data mt-1 text-micro text-ink-dim">{formatSpeed(aircraft.groundSpeed)} kt</div>
      </div>

      <div className="w-16 shrink-0 text-right">
        <div className="data text-base text-ink">
          {formatAltitude(aircraft.altitude, aircraft.onGround)}
        </div>
        <div className={`data mt-1 text-micro ${mark}`}>{verticalArrow(aircraft.verticalRate)}</div>
      </div>
    </button>
  );
}

/**
 * Altitude is encoded by position on a surface-to-FL450 column rather than by
 * colour, which stays reserved for contact state.
 */
function AltitudeGauge({
  altitude,
  state,
}: {
  altitude: number | null;
  state: 'normal' | 'overhead' | 'emergency';
}) {
  const fraction = altitudeFraction(altitude);
  const fill =
    state === 'emergency' ? 'bg-emergency' : state === 'overhead' ? 'bg-sodium' : 'bg-phosphor';

  return (
    <div className="relative w-px shrink-0 bg-hairline" aria-hidden="true">
      <span
        className={`absolute left-0 h-[6px] w-full ${fill}`}
        style={{ bottom: `calc(${(fraction * 100).toFixed(1)}% - 3px)` }}
      />
    </div>
  );
}
