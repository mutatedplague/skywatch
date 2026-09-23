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
    ['Receiver', config?.sourceLabel ?? 'Searching'],
    ['Site', config ? `${config.lat.toFixed(3)}, ${config.lon.toFixed(3)}` : 'No position set'],
    ['Range', config ? `${config.rangeNm} nm` : '—'],
    [
      'Alert volume',
      config
        ? `${config.alertRadiusNm} nm, below ${config.alertAltitudeFt.toLocaleString('en-US')} ft`
        : '—',
    ],
    ['Scope', 'Ready'],
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
      <div className="w-[min(26rem,88vw)] px-6">
        <p className="text-large font-medium tracking-tight text-ink">Skywatch</p>
        <p className="mt-1 text-small text-ink-dim">ADS-B radar console</p>
        <dl className="mt-8 space-y-2 text-small">
          {lines.slice(0, visible).map(([label, value]) => (
            <div key={label} className="settle flex items-baseline gap-4">
              <dt className="w-28 shrink-0 text-ink-dim">{label}</dt>
              <dd className="data text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
