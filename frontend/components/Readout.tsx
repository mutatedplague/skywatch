'use client';

import {
  compassPoint,
  displayName,
  formatAltitude,
  formatBearing,
  formatDistance,
  formatDuration,
  formatSpeed,
  formatVerticalRate,
} from '@/lib/format';
import type { Aircraft, FeedStats } from '@/lib/types';

interface ReadoutProps {
  aircraft: Aircraft | null;
  stats: FeedStats | null;
  now: number;
}

export default function Readout({ aircraft, stats, now }: ReadoutProps) {
  if (!aircraft) {
    return (
      <footer className="flex shrink-0 items-center gap-4 border-t border-hairline bg-console px-4 py-2.5 text-[0.72rem]">
        <span className="text-ink-dim">
          Select a contact on the scope or in the list to read its full track.
        </span>
        {stats?.error ? (
          <span className="ml-auto text-emergency">receiver: {stats.error}</span>
        ) : null}
      </footer>
    );
  }

  const squawkAlert = aircraft.emergency;

  return (
    <footer className="shrink-0 border-t border-hairline bg-console px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-[1.1rem] font-semibold tracking-[0.08em] text-strike">
            {displayName(aircraft)}
          </span>
          <span className="text-[0.68rem] text-ink-dim">{aircraft.hex.toUpperCase()}</span>
          {aircraft.overhead ? (
            <span className="border border-sodium/60 px-1.5 py-0.5 text-[0.6rem] tracking-[0.18em] text-sodium">
              OVERHEAD
            </span>
          ) : null}
          {squawkAlert ? (
            <span className="alert-pulse border border-emergency px-1.5 py-0.5 text-[0.6rem] tracking-[0.18em] text-emergency">
              SQUAWK {aircraft.squawk}
            </span>
          ) : null}
        </div>

        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[0.72rem]">
          <Cell label="type" value={aircraft.type ?? '—'} />
          <Cell label="reg" value={aircraft.registration ?? '—'} />
          <Cell label="alt" value={formatAltitude(aircraft.altitude, aircraft.onGround)} />
          <Cell label="v/s" value={`${formatVerticalRate(aircraft.verticalRate)} fpm`} />
          <Cell label="gs" value={`${formatSpeed(aircraft.groundSpeed)} kt`} />
          <Cell
            label="track"
            value={aircraft.track === null ? '—' : `${formatBearing(aircraft.track)}°`}
          />
          <Cell
            label="bearing"
            value={`${formatBearing(aircraft.bearingDeg)}° ${compassPoint(aircraft.bearingDeg)}`}
          />
          <Cell label="range" value={`${formatDistance(aircraft.distanceNm)} nm`} highlight />
          <Cell label="squawk" value={aircraft.squawk ?? '—'} />
          {aircraft.rssi !== null ? (
            <Cell label="signal" value={`${aircraft.rssi.toFixed(1)} dB`} />
          ) : null}
          <Cell label="held" value={formatDuration(now - aircraft.firstSeen)} />
        </dl>
      </div>
    </footer>
  );
}

function Cell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-dim">{label}</dt>
      <dd className={`tabular-nums ${highlight ? 'text-phosphor' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}
