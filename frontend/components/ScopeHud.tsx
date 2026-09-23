'use client';

import { TERRAIN_LAYERS, TERRAIN_NONE, terrainLayer } from '@/lib/terrain';
import { THEMES } from '@/lib/themes';
import type { SiteConfig } from '@/lib/types';
import SegmentedControl from './SegmentedControl';
import type { Symbology } from './RadarScope';

const SYMBOLOGY_OPTIONS: Array<{ value: Symbology; label: string }> = [
  { value: 'icons', label: 'icons' },
  { value: 'blips', label: 'blips' },
];

const THEME_OPTIONS: Array<{ value: string; label: string }> = THEMES.map((theme) => ({
  value: theme.id,
  label: theme.label,
}));

const TERRAIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: TERRAIN_NONE, label: 'off' },
  ...TERRAIN_LAYERS.map((layer) => ({ value: layer.id, label: layer.label })),
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
  theme: string;
  onTheme: (value: string) => void;
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
  theme,
  onTheme,
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
      {showSymbology ? (
        <SegmentedControl
          label="SYMBOLS"
          options={SYMBOLOGY_OPTIONS}
          value={symbology}
          onChange={onSymbology}
        />
      ) : null}
      <SegmentedControl
        label="TERRAIN"
        options={TERRAIN_OPTIONS}
        value={terrain}
        onChange={onTerrain}
      />
      <SegmentedControl label="THEME" options={THEME_OPTIONS} value={theme} onChange={onTheme} />
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
    <dl className={`hud-frame hud-scan space-y-0.5 bg-console/40 p-2.5 text-[0.62rem] leading-relaxed ${className}`}>
      <Row label="SITE" value={config.site} />
      <Row label="POS" value={`${lat}  ${lon}`} />
      <Row label="FEED" value={config.sourceLabel} />
      <Row
        label="ALERT"
        value={`${config.alertRadiusNm} nm below ${config.alertAltitudeFt.toLocaleString('en-US')}′`}
      />
      <Row label="SWEEP" value="15 rpm" />
      {onEdit && config.siteEditable !== false ? (
        <div className="flex gap-2 pt-1">
          <dt className="w-11 shrink-0" />
          <dd>
            <button
              type="button"
              onClick={onEdit}
              className="text-ink-dim underline-offset-2 transition-colors hover:text-phosphor hover:underline"
            >
              edit site &amp; airspace
            </button>
          </dd>
        </div>
      ) : null}
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

export function ScopeLegend({
  terrain = TERRAIN_NONE,
  className = '',
}: {
  terrain?: string;
  className?: string;
}) {
  const layer = terrainLayer(terrain);
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
      {layer ? <p className="text-ink-dim/80">Terrain: {layer.attribution}</p> : null}
    </div>
  );
}
