'use client';

import type { SiteConfig } from '@/lib/types';
import SegmentedControl from './SegmentedControl';
import type { Symbology } from './RadarScope';

const SYMBOLOGY_OPTIONS: Array<{ value: Symbology; label: string }> = [
  { value: 'icons', label: 'icons' },
  { value: 'blips', label: 'blips' },
];

interface ScopeControlsProps {
  rangeOptions: Array<{ value: number; label: string }>;
  rangeNm: number;
  onRange: (value: number) => void;
  symbology: Symbology;
  onSymbology: (value: Symbology) => void;
  className?: string;
}

export function ScopeControls({
  rangeOptions,
  rangeNm,
  onRange,
  symbology,
  onSymbology,
  className = '',
}: ScopeControlsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 lg:flex-col lg:items-start ${className}`}>
      <SegmentedControl
        label="RANGE"
        options={rangeOptions}
        value={rangeNm}
        suffix="nm"
        onChange={onRange}
      />
      <SegmentedControl
        label="SYMBOLS"
        options={SYMBOLOGY_OPTIONS}
        value={symbology}
        onChange={onSymbology}
      />
    </div>
  );
}

/** Station data, sitting where a console would silk-screen it. */
export function SiteBlock({ config, className = '' }: { config: SiteConfig | null; className?: string }) {
  if (!config) return null;

  const lat = `${Math.abs(config.lat).toFixed(4)}° ${config.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(config.lon).toFixed(4)}° ${config.lon >= 0 ? 'E' : 'W'}`;

  return (
    <dl className={`space-y-0.5 text-[0.62rem] leading-relaxed ${className}`}>
      <Row label="SITE" value={config.site} />
      <Row label="POS" value={`${lat}  ${lon}`} />
      <Row label="FEED" value={config.sourceLabel} />
      <Row
        label="ALERT"
        value={`${config.alertRadiusNm} nm below ${config.alertAltitudeFt.toLocaleString('en-US')}′`}
      />
      <Row label="SWEEP" value="15 rpm" />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-11 shrink-0 tracking-[0.14em] text-ink-dim">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

export function ScopeLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 text-[0.62rem] lg:items-end ${className}`}>
      <p className="text-ink-dim">
        <span className="text-sodium">amber</span> inside your airspace
      </p>
      <p className="text-ink-dim">
        <span className="text-emergency">red</span> emergency squawk
      </p>
      <a
        href="https://adsb-radar.com"
        target="_blank"
        rel="noreferrer noopener"
        className="pointer-events-auto text-ink-dim underline-offset-2 transition-colors hover:text-ink hover:underline"
      >
        Aircraft icons by ADS-B Radar
      </a>
    </div>
  );
}
