'use client';

import { useEffect, useRef, type RefObject } from 'react';
import {
  compassPoint,
  displayName,
  formatAltitude,
  formatBearing,
  formatDistance,
  formatDuration,
  formatSpeed,
  formatVerticalRate,
  verticalArrow,
} from '@/lib/format';
import type { TrackedPoint } from '@/lib/trackedPoint';
import type { Aircraft } from '@/lib/types';

interface ContactCalloutProps {
  aircraft: Aircraft | null;
  now: number;
  pointRef: RefObject<TrackedPoint>;
  onClose: () => void;
}

const OFFSET_X = 34;
const OFFSET_Y = 34;

/**
 * The locked contact's full track, pinned to the contact itself rather than
 * parked in a footer: a bracket on the target, a leader out to the panel, and
 * the numbers in a fixed column so they can be read without hunting.
 *
 * Position is driven straight from the DOM on an animation frame — the target
 * moves every frame and re-rendering this panel that often would be wasteful.
 */
export default function ContactCallout({
  aircraft,
  now,
  pointRef,
  onClose,
}: ContactCalloutProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const markRef = useRef<SVGGElement | null>(null);
  const leaderRef = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    if (!aircraft) return;
    let frame = 0;

    const follow = () => {
      frame = requestAnimationFrame(follow);
      const wrap = wrapRef.current;
      const panel = panelRef.current;
      const point = pointRef.current;
      if (!wrap || !panel || !point) return;

      if (!point.visible) {
        wrap.style.opacity = '0';
        return;
      }
      wrap.style.opacity = '1';

      const box = wrap.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;

      // Flip the panel back over the target when it would run off the edge.
      const flipX = point.x + OFFSET_X + width > box.width;
      const flipY = point.y + OFFSET_Y + height > box.height;
      const panelX = flipX ? point.x - OFFSET_X - width : point.x + OFFSET_X;
      const panelY = flipY ? point.y - OFFSET_Y - height : point.y + OFFSET_Y;

      panel.style.transform = `translate(${Math.round(panelX)}px, ${Math.round(panelY)}px)`;

      const anchorX = flipX ? panelX + width : panelX;
      const anchorY = flipY ? panelY + height : panelY;
      leaderRef.current?.setAttribute('x1', String(point.x));
      leaderRef.current?.setAttribute('y1', String(point.y));
      leaderRef.current?.setAttribute('x2', String(anchorX));
      leaderRef.current?.setAttribute('y2', String(anchorY));
      markRef.current?.setAttribute('transform', `translate(${point.x} ${point.y})`);
    };

    follow();
    return () => cancelAnimationFrame(frame);
  }, [aircraft, pointRef]);

  if (!aircraft) return null;

  const state = aircraft.emergency ? 'emergency' : aircraft.overhead ? 'overhead' : 'normal';
  const mark =
    state === 'emergency' ? 'stroke-emergency' : state === 'overhead' ? 'stroke-sodium' : 'stroke-phosphor';
  const tone =
    state === 'emergency' ? 'text-emergency' : state === 'overhead' ? 'text-sodium' : 'text-phosphor';

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-20 transition-opacity">
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <line ref={leaderRef} className={mark} strokeWidth="1" opacity="0.65" />
        <g ref={markRef} className={mark} fill="none" strokeWidth="1">
          {/* Four corners rather than a box: the target stays visible inside. */}
          <path d="M -11 -5 L -11 -11 L -5 -11" />
          <path d="M 5 -11 L 11 -11 L 11 -5" />
          <path d="M 11 5 L 11 11 L 5 11" />
          <path d="M -5 11 L -11 11 L -11 5" />
        </g>
      </svg>

      <div
        ref={panelRef}
        className="pointer-events-auto absolute left-0 top-0 w-[16.5rem] border border-hairline bg-void/92 backdrop-blur-[2px]"
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-hairline px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className={`data text-mid font-medium ${tone}`}>{displayName(aircraft)}</span>
            {aircraft.type ? (
              <span className="data text-micro text-ink-dim">{aircraft.type}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-micro text-ink-dim transition-colors hover:text-ink"
            aria-label="Clear the locked contact"
          >
            Close
          </button>
        </div>

        <dl className="px-4 py-3">
          <Line label="Altitude">
            {formatAltitude(aircraft.altitude, aircraft.onGround)}
            <span className={`ml-2 ${tone}`}>{verticalArrow(aircraft.verticalRate)}</span>
          </Line>
          <Line label="Vertical">{formatVerticalRate(aircraft.verticalRate)} fpm</Line>
          <Line label="Ground speed">{formatSpeed(aircraft.groundSpeed)} kt</Line>
          <Line label="Range">{formatDistance(aircraft.distanceNm)} nm</Line>
          <Line label="Bearing">
            {formatBearing(aircraft.bearingDeg)}° {compassPoint(aircraft.bearingDeg)}
          </Line>
          <Line label="Track">
            {aircraft.track === null ? '—' : `${formatBearing(aircraft.track)}°`}
          </Line>
          <Line label="Squawk">{aircraft.squawk ?? '—'}</Line>
          {aircraft.registration ? <Line label="Registration">{aircraft.registration}</Line> : null}
          <Line label="Held">{formatDuration(now - aircraft.firstSeen)}</Line>
          {aircraft.rssi !== null ? <Line label="Signal">{aircraft.rssi.toFixed(1)} dB</Line> : null}
        </dl>

        {aircraft.emergency ? (
          <p className="border-t border-hairline px-4 py-2 text-micro text-emergency">
            Emergency squawk {aircraft.squawk}
          </p>
        ) : aircraft.overhead ? (
          <p className="border-t border-hairline px-4 py-2 text-micro text-sodium">
            Inside the alert volume
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <dt className="text-micro text-ink-dim">{label}</dt>
      <dd className="data text-small text-ink">{children}</dd>
    </div>
  );
}
