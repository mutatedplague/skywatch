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
 * Modelled on a paper flight progress strip: a state bar down the left, the
 * callsign block in the middle, and the numbers in a fixed right-hand column.
 */
export default function FlightStrip({ aircraft, selected, onSelect }: FlightStripProps) {
  const state = aircraft.emergency ? 'emergency' : aircraft.overhead ? 'overhead' : 'normal';

  const accent =
    state === 'emergency'
      ? 'text-emergency'
      : state === 'overhead'
        ? 'text-sodium'
        : 'text-phosphor';

  const border = selected
    ? 'border-strike/60 bg-strike/[0.06]'
    : state === 'emergency'
      ? 'border-emergency/45'
      : state === 'overhead'
        ? 'border-sodium/45'
        : 'border-hairline hover:border-hairline-lit';

  return (
    <button
      type="button"
      onClick={() => onSelect(aircraft.hex)}
      aria-pressed={selected}
      className={`strip-arrive flex w-full items-stretch gap-3 border-b border-l-2 ${border} bg-console/60 px-3 py-2 text-left transition-colors`}
      style={{ borderLeftColor: `var(--color-${state === 'emergency' ? 'emergency' : state === 'overhead' ? 'sodium' : 'phosphor-dim'})` }}
    >
      <AltitudeGauge altitude={aircraft.altitude} state={state} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`font-display text-[0.95rem] font-semibold tracking-[0.06em] ${accent}`}>
            {displayName(aircraft)}
          </span>
          {aircraft.type ? (
            <span className="text-[0.66rem] text-ink-dim">{aircraft.type}</span>
          ) : null}
          {aircraft.military ? (
            <span className="border border-ink-dim/50 px-1 text-[0.56rem] tracking-[0.1em] text-ink-dim">
              MIL
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[0.68rem] text-ink-dim">
          {formatBearing(aircraft.bearingDeg)}° {compassPoint(aircraft.bearingDeg)} ·{' '}
          {formatDistance(aircraft.distanceNm)} nm
          {aircraft.squawk ? ` · sq ${aircraft.squawk}` : ''}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[0.82rem] text-ink tabular-nums">
          {formatAltitude(aircraft.altitude, aircraft.onGround)}{' '}
          <span className={accent}>{verticalArrow(aircraft.verticalRate)}</span>
        </div>
        <div className="mt-0.5 text-[0.68rem] text-ink-dim tabular-nums">
          {formatSpeed(aircraft.groundSpeed)} kt
        </div>
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
    <div className="relative w-1 shrink-0 bg-hairline" aria-hidden="true">
      <span
        className={`absolute left-0 h-[7px] w-full ${fill}`}
        style={{ bottom: `calc(${(fraction * 100).toFixed(1)}% - 3.5px)` }}
      />
    </div>
  );
}
