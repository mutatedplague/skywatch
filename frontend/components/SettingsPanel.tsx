'use client';

import { useEffect, useRef, useState } from 'react';
import { saveSite, type SitePatch } from '@/lib/api';
import type { SiteConfig } from '@/lib/types';

interface SettingsPanelProps {
  config: SiteConfig;
  onClose: () => void;
}

/** Pull "39.2242, -82.9893" (or a tab/space separated pair) out of one paste. */
function splitPair(text: string): [string, string] | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  return match ? [match[1] as string, match[2] as string] : null;
}

export default function SettingsPanel({ config, onClose }: SettingsPanelProps) {
  const [site, setSite] = useState(config.site);
  const [lat, setLat] = useState(config.positionSource === 'none' ? '' : String(config.lat));
  const [lon, setLon] = useState(config.positionSource === 'none' ? '' : String(config.lon));
  const [rangeNm, setRangeNm] = useState(String(config.rangeNm));
  const [alertRadiusNm, setAlertRadiusNm] = useState(String(config.alertRadiusNm));
  const [alertAltitudeFt, setAlertAltitudeFt] = useState(String(config.alertAltitudeFt));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

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

  /** The browser asks its own permission; we never see a position until granted. */
  const useThisDevice = () => {
    if (!navigator.geolocation) {
      setError('this browser has no location service');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(6));
        setLon(position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (cause) => {
        setLocating(false);
        setError(
          cause.code === cause.PERMISSION_DENIED
            ? 'location permission denied in the browser'
            : `could not read this device's location: ${cause.message}`,
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

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
      rangeNm: Number(rangeNm),
      alertRadiusNm: Number(alertRadiusNm),
      alertAltitudeFt: Number(alertAltitudeFt),
    };
    // Leaving the position blank keeps whatever the receiver already has.
    if (lat.trim() !== '' || lon.trim() !== '') {
      patch.lat = Number(lat);
      patch.lon = Number(lon);
    }
    void submit(patch);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/85 p-4 py-12"
      role="dialog"
      aria-modal="true"
      aria-label="Site and airspace settings"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={onSave}
        className="w-full max-w-[28rem] border border-hairline bg-console p-8"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-large font-medium tracking-tight text-ink">Site and airspace</h2>
        <p className="mt-2 max-w-[42ch] text-small leading-relaxed text-ink-dim">
          Everything on the scope is measured from this position. Changes save on the receiver, so
          every console sees them.
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

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input
              value={lat}
              inputMode="decimal"
              placeholder="39.224209"
              onChange={(event) => {
                // Accept a pasted "lat, lon" pair in either box.
                const pair = splitPair(event.target.value);
                if (pair) {
                  setLat(pair[0]);
                  setLon(pair[1]);
                } else {
                  setLat(event.target.value);
                }
              }}
              className={INPUT}
            />
          </Field>
          <Field label="Longitude">
            <input
              value={lon}
              inputMode="decimal"
              placeholder="-82.989314"
              onChange={(event) => {
                const pair = splitPair(event.target.value);
                if (pair) {
                  setLat(pair[0]);
                  setLon(pair[1]);
                } else {
                  setLon(event.target.value);
                }
              }}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-4">
          <span className="text-micro text-ink-dim">
            Decimal degrees. South and west are negative.
          </span>
          <button type="button" onClick={useThisDevice} disabled={locating} className={GHOST}>
            {locating ? 'Locating…' : 'Use this device'}
          </button>
        </div>

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
        <p className="mt-2 text-micro text-ink-dim">
          How far out traffic is pulled, 5 to 250 nm. The scope zooms within it.
        </p>

        {error ? (
          <p className="mt-6 border-l-2 border-emergency pl-3 text-small text-emergency">{error}</p>
        ) : null}

        <div className="mt-8 flex items-baseline gap-5">
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className={GHOST}>
            Cancel
          </button>
          {config.positionSource === 'console' ? (
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

const INPUT =
  'data mt-1.5 w-full border-b border-hairline bg-transparent pb-1.5 text-base text-ink ' +
  'transition-colors placeholder:text-ink-dim/60 hover:border-hairline-lit ' +
  'focus:border-phosphor focus:outline-none';

const PRIMARY =
  'border-b border-phosphor pb-0.5 text-base text-phosphor transition-colors ' +
  'hover:text-ink disabled:opacity-50';

const GHOST =
  'border-b border-transparent pb-0.5 text-small text-ink-dim transition-colors ' +
  'hover:border-hairline-lit hover:text-ink disabled:opacity-50';

function Field({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-6 block">
      <span className="flex items-baseline justify-between text-micro text-ink-dim">
        {label}
        {suffix ? <span>{suffix}</span> : null}
      </span>
      {children}
    </label>
  );
}
