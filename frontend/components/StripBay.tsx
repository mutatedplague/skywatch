'use client';

import { displayName, formatAltitude, formatDistance } from '@/lib/format';
import type { Aircraft, SiteConfig } from '@/lib/types';
import FlightStrip from './FlightStrip';

interface StripBayProps {
  aircraft: Aircraft[];
  config: SiteConfig | null;
  selectedHex: string | null;
  onSelect: (hex: string) => void;
}

export default function StripBay({ aircraft, config, selectedHex, onSelect }: StripBayProps) {
  const overhead = aircraft.filter((contact) => contact.overhead);

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-hairline bg-void">
      <div className="flex shrink-0 items-baseline justify-between border-b border-hairline px-3 py-2">
        <h2 className="font-display text-[0.8rem] tracking-[0.22em] text-ink">CONTACTS</h2>
        <span className="text-[0.66rem] text-ink-dim">nearest first</span>
      </div>

      {overhead.length > 0 ? (
        <div className="shrink-0 border-b border-sodium/40 bg-sodium/[0.07] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="alert-pulse inline-block h-1.5 w-1.5 bg-sodium" />
            <span className="font-display text-[0.78rem] tracking-[0.2em] text-sodium">
              OVERHEAD
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {overhead.map((contact) => (
              <li key={contact.hex} className="text-[0.7rem] text-ink">
                {displayName(contact)} · {formatAltitude(contact.altitude, contact.onGround)} ·{' '}
                {formatDistance(contact.distanceNm)} nm
              </li>
            ))}
          </ul>
          {config ? (
            <p className="mt-1 text-[0.62rem] text-ink-dim">
              within {config.alertRadiusNm} nm below{' '}
              {config.alertAltitudeFt.toLocaleString('en-US')}′
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {aircraft.length === 0 ? (
          <p className="px-3 py-6 text-[0.72rem] leading-relaxed text-ink-dim">
            No contacts in range. The scope is live — traffic appears here the moment a transponder
            report lands inside {config ? `${config.rangeNm} nm` : 'range'}.
          </p>
        ) : (
          aircraft.map((contact) => (
            <FlightStrip
              key={contact.hex}
              aircraft={contact}
              selected={contact.hex === selectedHex}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </section>
  );
}
