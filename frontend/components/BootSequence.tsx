'use client';

import { useEffect, useState } from 'react';
import type { SiteConfig } from '@/lib/types';

interface BootSequenceProps {
  config: SiteConfig | null;
  onComplete: () => void;
}

/**
 * The one piece of non-interactive motion in the console: a single power-on
 * sequence that also states what the receiver is actually connected to.
 */
export default function BootSequence({ config, onComplete }: BootSequenceProps) {
  const [visible, setVisible] = useState(0);
  const [fading, setFading] = useState(false);

  const lines: Array<[string, string]> = [
    ['RECEIVER', config?.sourceLabel ?? 'SEARCHING'],
    [
      'SITE',
      config ? `${config.lat.toFixed(3)}, ${config.lon.toFixed(3)}` : 'AWAITING POSITION',
    ],
    ['RANGE', config ? `${config.rangeNm} NM` : '—'],
    ['ALERT VOLUME', config ? `${config.alertRadiusNm} NM / ${config.alertAltitudeFt} FT` : '—'],
    ['SCOPE', 'ONLINE'],
  ];

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onComplete();
      return;
    }

    const timers: number[] = [];
    lines.forEach((_, index) => {
      timers.push(window.setTimeout(() => setVisible(index + 1), 160 + index * 190));
    });
    timers.push(window.setTimeout(() => setFading(true), 160 + lines.length * 190 + 420));
    timers.push(window.setTimeout(onComplete, 160 + lines.length * 190 + 900));

    return () => timers.forEach(window.clearTimeout);
    // Runs once: the sequence should not restart when the first snapshot lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-void transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="crt-scanlines pointer-events-none absolute inset-0" />
      <div className="w-[min(30rem,88vw)] px-6">
        <p className="font-display text-[1.6rem] font-bold tracking-[0.42em] text-phosphor">
          SKYWATCH
        </p>
        <p className="mt-1 text-[0.7rem] tracking-[0.2em] text-ink-dim">
          ADS-B SURVEILLANCE CONSOLE
        </p>
        <dl className="mt-7 space-y-1.5 text-[0.76rem]">
          {lines.slice(0, visible).map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="text-ink-dim">{label}</dt>
              <dd className="flex-1 border-b border-dotted border-hairline" aria-hidden="true" />
              <dd className="text-phosphor">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
