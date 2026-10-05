'use client';

import { TERRAIN_LAYERS, TERRAIN_NONE, terrainLayer } from '@/lib/terrain';
import type { SiteConfig } from '@/lib/types';
import SegmentedControl from './SegmentedControl';
import type { Symbology } from './RadarScope';

const SYMBOLOGY_OPTIONS: Array<{ value: Symbology; label: string }> = [
  { value: 'icons', label: 'Silhouettes' },
  { value: 'blips', label: 'Blips' },
];

const TERRAIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: TERRAIN_NONE, label: 'Off' },
  ...TERRAIN_LAYERS.map((layer) => ({
    value: layer.id,
    label: layer.label.charAt(0).toUpperCase() + layer.label.slice(1),
  })),
];

interface ScopeControlsProps {
  rangeOptions: Array<{ value: number; label: string }>;
  rangeNm: number;
  onRange: (value: number) => void;
  symbology: Symbology;
  onSymbology: (value: Symbology) => void;
  /** Hidden in the 3D view, which has no blip symbology to switch. */
  showSymbology?: boolean;
  terrain: string;
  onTerrain: (value: string) => void;
  className?: string;
}

export function ScopeControls({
  rangeOptions,
  rangeNm,
  onRange,
  symbology,
  onSymbology,
  showSymbology = true,
  terrain,
  onTerrain,
  className = '',
}: ScopeControlsProps) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-8 gap-y-3 lg:flex-col lg:items-start ${className}`}>
      <SegmentedControl
        label="Range"
        options={rangeOptions}
        value={rangeNm}
        suffix="nm"
        onChange={onRange}
      />
      {showSymbology ? (
        <SegmentedControl
          label="Symbols"
          options={SYMBOLOGY_OPTIONS}
          value={symbology}
          onChange={onSymbology}
        />
      ) : null}
      <SegmentedControl
        label="Terrain"
        options={TERRAIN_OPTIONS}
        value={terrain}
        onChange={onTerrain}
      />
    </div>
  );
}

/** Station data, sitting where a console would silk-screen it. */
export function SiteBlock({
  config,
  onEdit,
  className = '',
}: {
  config: SiteConfig | null;
  onEdit?: () => void;
  className?: string;
}) {
  if (!config) return null;

  const lat = `${Math.abs(config.lat).toFixed(4)}° ${config.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(config.lon).toFixed(4)}° ${config.lon >= 0 ? 'E' : 'W'}`;

  return (
    <dl className={`space-y-1.5 text-micro ${className}`}>
      <Row label="Site" value={config.site} />
      {config.address ? <Row label="Address" value={config.address} clamp /> : null}
      <Row label="Position" value={`${lat}  ${lon}`} />
      <Row label="Receiver" value={config.sourceLabel} />
      <Row
        label="Alert"
        value={`${config.alertRadiusNm} nm, below ${config.alertAltitudeFt.toLocaleString('en-US')} ft`}
      />
      {onEdit && config.siteEditable !== false ? (
        <div className="flex gap-3 pt-1">
          <dt className="w-16 shrink-0" />
          <dd>
            <button
              type="button"
              onClick={onEdit}
              className="border-b border-hairline-lit pb-0.5 text-ink-dim transition-colors hover:text-ink"
            >
              Settings
            </button>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function Row({ label, value, clamp = false }: { label: string; value: string; clamp?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-ink-dim">{label}</dt>
      <dd className={`data text-ink ${clamp ? 'line-clamp-2' : ''}`} title={clamp ? value : undefined}>
        {value}
      </dd>
    </div>
  );
}

export function ScopeLegend({
  terrain = TERRAIN_NONE,
  className = '',
}: {
  terrain?: string;
  className?: string;
}) {
  const layer = terrainLayer(terrain);
  return (
    <div className={`flex flex-col gap-1 text-micro lg:items-end ${className}`}>
      <p className="text-ink-dim">
        <span className="text-sodium">Amber</span> inside the alert volume
      </p>
      <p className="text-ink-dim">
        <span className="text-emergency">Red</span> emergency squawk
      </p>
      <a
        href="https://adsb-radar.com"
        target="_blank"
        rel="noreferrer noopener"
        className="pointer-events-auto text-ink-dim underline-offset-2 transition-colors hover:text-ink hover:underline"
      >
        Aircraft icons by ADS-B Radar
      </a>
      {layer ? <p className="text-ink-dim">Terrain {layer.attribution}</p> : null}
    </div>
  );
}
