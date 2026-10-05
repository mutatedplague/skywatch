'use client';

import { useEffect, useRef, useState } from 'react';
import { saveSite, type SitePatch } from '@/lib/api';
import { THEME_OPTIONS } from '@/lib/themes';
import type { SiteConfig, SourceName } from '@/lib/types';
import { ErrorLine, Field, GHOST, Hint, INPUT, PRIMARY } from './form';
import PositionFields, { parsePosition, type PositionValue } from './PositionFields';
import SegmentedControl from './SegmentedControl';
import SourceFields, { type SourceValue } from './SourceFields';

interface SettingsPanelProps {
  config: SiteConfig;
  /** The accent is this browser's own preference: it applies as soon as it is picked. */
  theme: string;
  onTheme: (theme: string) => void;
  onClose: () => void;
}

export default function SettingsPanel({ config, theme, onTheme, onClose }: SettingsPanelProps) {
  const [site, setSite] = useState(config.site);
  const [position, setPosition] = useState<PositionValue>({
    lat: config.positionSource === 'none' ? '' : String(config.lat),
    lon: config.positionSource === 'none' ? '' : String(config.lon),
    address: config.address ?? '',
  });
  const [source, setSource] = useState<SourceValue>({
    source: config.requestedSource as SourceName,
    dump1090Url: config.dump1090Url,
    openskyClientId: config.openskyClientId,
    openskyClientSecret: '',
  });
  const [rangeNm, setRangeNm] = useState(String(config.rangeNm));
  const [alertRadiusNm, setAlertRadiusNm] = useState(String(config.alertRadiusNm));
  const [alertAltitudeFt, setAlertAltitudeFt] = useState(String(config.alertAltitudeFt));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Swallow it, or the scope behind us also clears its locked contact.
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const submit = async (patch: SitePatch) => {
    setBusy(true);
    setError(null);
    try {
      await saveSite(patch);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'the receiver refused the change');
    } finally {
      setBusy(false);
    }
  };

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    const patch: SitePatch = {
      site,
      source: source.source,
      rangeNm: Number(rangeNm),
      alertRadiusNm: Number(alertRadiusNm),
      alertAltitudeFt: Number(alertAltitudeFt),
    };
    // Leaving the position blank keeps whatever the receiver already has.
    if (position.lat.trim() !== '' || position.lon.trim() !== '') {
      patch.lat = Number(position.lat);
      patch.lon = Number(position.lon);
      patch.address = position.address;
    }
    // Blank feed settings fall back to .env on the receiver; a saved secret
    // stays saved unless a new one is typed.
    if (source.source === 'dump1090') patch.dump1090Url = source.dump1090Url.trim();
    if (source.source === 'opensky') {
      patch.openskyClientId = source.openskyClientId.trim();
      if (source.openskyClientSecret !== '') patch.openskyClientSecret = source.openskyClientSecret;
    }
    void submit(patch);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/85 p-4 py-12"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={onSave}
        className="w-full max-w-[30rem] border border-hairline bg-console p-8"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-large font-medium tracking-tight text-ink">Settings</h2>
        <p className="mt-2 max-w-[42ch] text-small leading-relaxed text-ink-dim">
          The station, the receiver and the alert volume save on the receiver, so every console
          sees them. Display settings are this browser&apos;s own.
        </p>

        <h3 className="mt-7 text-base font-medium text-ink">Display</h3>
        <div className="mt-4">
          <SegmentedControl label="Accent" options={THEME_OPTIONS} value={theme} onChange={onTheme} />
        </div>
        <Hint>Recolours the chrome, the scope and the terrain tint. Amber and red keep their meaning.</Hint>

        <hr className="my-7 border-hairline" />

        <h3 className="text-base font-medium text-ink">Station</h3>
        <p className="mt-2 max-w-[42ch] text-small leading-relaxed text-ink-dim">
          Everything on the scope is measured from this position.
        </p>

        <Field label="Site name">
          <input
            ref={firstFieldRef}
            value={site}
            onChange={(event) => setSite(event.target.value)}
            maxLength={24}
            className={INPUT}
          />
        </Field>

        <PositionFields value={position} onChange={setPosition} addressLookup={config.addressLookup} />

        <hr className="my-7 border-hairline" />

        <h3 className="text-base font-medium text-ink">Receiver</h3>
        <p className="mb-5 mt-2 max-w-[42ch] text-small leading-relaxed text-ink-dim">
          Where the aircraft come from. Switching takes effect as soon as you save.
        </p>
        <SourceFields
          value={source}
          onChange={setSource}
          position={parsePosition(position)}
          rangeNm={Number(rangeNm) || config.rangeNm}
          openskyHasSecret={config.openskyHasSecret}
        />

        <hr className="my-7 border-hairline" />

        <h3 className="text-base font-medium text-ink">Alert volume</h3>
        <p className="mt-2 max-w-[42ch] text-small leading-relaxed text-ink-dim">
          A contact inside this radius <em className="not-italic text-ink">and</em> below this
          height counts as overhead: amber on the scope, and listed first.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Alert radius" suffix="nm">
            <input
              value={alertRadiusNm}
              inputMode="decimal"
              onChange={(event) => setAlertRadiusNm(event.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Alert ceiling" suffix="ft">
            <input
              value={alertAltitudeFt}
              inputMode="numeric"
              onChange={(event) => setAlertAltitudeFt(event.target.value)}
              className={INPUT}
            />
          </Field>
        </div>

        <Field label="Receiver range" suffix="nm">
          <input
            value={rangeNm}
            inputMode="decimal"
            onChange={(event) => setRangeNm(event.target.value)}
            className={INPUT}
          />
        </Field>
        <Hint>How far out traffic is pulled, 5 to 250 nm. The scope zooms within it.</Hint>

        {error ? <ErrorLine>{error}</ErrorLine> : null}

        <div className="mt-8 flex items-baseline gap-5">
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className={GHOST}>
            Cancel
          </button>
          {config.positionSource === 'console' || config.sourceFrom === 'console' ? (
            <button
              type="button"
              onClick={() => void submit({ reset: true })}
              disabled={busy}
              className={`${GHOST} ml-auto`}
              title="Discard what the console saved and use the receiver's .env again"
            >
              Revert to .env
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
