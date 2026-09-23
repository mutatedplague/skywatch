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
    <section className="flex h-full min-h-0 flex-col border-l border-hairline">
      <div className="flex shrink-0 items-baseline justify-between border-b border-hairline px-6 py-4">
        <h2 className="text-base font-medium text-ink">Contacts</h2>
        <span className="text-micro text-ink-dim">Nearest first</span>
      </div>

      {overhead.length > 0 ? (
        <div className="shrink-0 border-b border-hairline px-6 py-4">
          <div className="flex items-baseline gap-2">
            <span className="inline-block h-1.5 w-1.5 translate-y-[-1px] bg-sodium" />
            <h3 className="text-base font-medium text-sodium">Overhead</h3>
          </div>
          <ul className="mt-2 space-y-1">
            {overhead.map((contact) => (
              <li key={contact.hex} className="flex items-baseline justify-between gap-4">
                <span className="data text-small text-ink">{displayName(contact)}</span>
                <span className="data text-small text-ink-dim">
                  {formatAltitude(contact.altitude, contact.onGround)}
                  <span className="ml-3">{formatDistance(contact.distanceNm)} nm</span>
                </span>
              </li>
            ))}
          </ul>
          {config ? (
            <p className="mt-2 text-micro text-ink-dim">
              Within {config.alertRadiusNm} nm, below{' '}
              {config.alertAltitudeFt.toLocaleString('en-US')} ft
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {aircraft.length === 0 ? (
          <p className="max-w-[34ch] px-6 py-6 text-small leading-relaxed text-ink-dim">
            Nothing in range yet. Aircraft appear here as soon as the receiver decodes a position
            within {config ? `${config.rangeNm} nm` : 'range'}.
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
