'use client';

import { useRef, useState } from 'react';
import { describePosition, type GeocodeHit, searchAddress } from '@/lib/api';
import { ErrorLine, Field, GHOST, Hint, INPUT } from './form';

export interface PositionValue {
  lat: string;
  lon: string;
  /** The caption saved with the position. Blank once a coordinate is typed by hand. */
  address: string;
}

/** The position as numbers, or null while the boxes do not hold a usable one. */
export function parsePosition(value: PositionValue): { lat: number; lon: number } | null {
  if (value.lat.trim() === '' || value.lon.trim() === '') return null;
  const lat = Number(value.lat);
  const lon = Number(value.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Pull "39.2242, -82.9893" (or a tab/space separated pair) out of one paste. */
function splitPair(text: string): [string, string] | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  return match ? [match[1] as string, match[2] as string] : null;
}

interface PositionFieldsProps {
  value: PositionValue;
  onChange: (next: PositionValue) => void;
  /** False hides the address box when the receiver has no geocoder. */
  addressLookup: boolean;
}

/**
 * Three ways to say where the antenna is: an address looked up on the
 * receiver, the browser's own location, or coordinates typed or pasted in.
 */
export default function PositionFields({ value, onChange, addressLookup }: PositionFieldsProps) {
  const [query, setQuery] = useState(value.address);
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever the position changes, so a slow reverse lookup from
  // "use this device" cannot caption coordinates it no longer describes.
  const editRef = useRef(0);

  const typed = (patch: Partial<PositionValue>) => {
    editRef.current += 1;
    onChange({ ...value, ...patch, address: '' });
  };

  const onCoordinateInput = (which: 'lat' | 'lon', text: string) => {
    // Accept a pasted "lat, lon" pair in either box.
    const pair = splitPair(text);
    if (pair) typed({ lat: pair[0], lon: pair[1] });
    else typed(which === 'lat' ? { lat: text } : { lon: text });
  };

  const findAddress = async () => {
    if (query.trim().length < 3) {
      setError('type at least three characters of the address');
      return;
    }
    setSearching(true);
    setError(null);
    setHits(null);
    try {
      setHits(await searchAddress(query));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'address lookup failed');
    } finally {
      setSearching(false);
    }
  };

  const chooseHit = (hit: GeocodeHit) => {
    editRef.current += 1;
    onChange({ lat: hit.lat.toFixed(6), lon: hit.lon.toFixed(6), address: hit.label });
    setQuery(hit.label);
    setHits(null);
    setError(null);
  };

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
        const lat = position.coords.latitude.toFixed(6);
        const lon = position.coords.longitude.toFixed(6);
        typed({ lat, lon });
        setLocating(false);
        if (!addressLookup) return;
        // Caption the fix with the nearest address; a miss just leaves it bare.
        const edit = editRef.current;
        describePosition(position.coords.latitude, position.coords.longitude)
          .then((hit) => {
            if (!hit || editRef.current !== edit) return;
            onChange({ lat, lon, address: hit.label });
            setQuery(hit.label);
          })
          .catch(() => undefined);
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

  return (
    <div>
      {addressLookup ? (
        <>
          <Field label="Address">
            <div className="flex items-baseline gap-4">
              <input
                value={query}
                placeholder="Street, town or postcode"
                autoComplete="street-address"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Enter here looks the address up; it must not submit the form.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void findAddress();
                  }
                }}
                className={INPUT}
              />
              <button
                type="button"
                onClick={() => void findAddress()}
                disabled={searching}
                className={`${GHOST} shrink-0`}
              >
                {searching ? 'Finding…' : 'Find'}
              </button>
            </div>
          </Field>

          {hits && hits.length > 0 ? (
            <ul className="mt-3 border border-hairline" aria-label="Matching places">
              {hits.map((hit) => (
                <li key={`${hit.lat},${hit.lon}`} className="border-b border-hairline last:border-b-0">
                  <button
                    type="button"
                    onClick={() => chooseHit(hit)}
                    className="block w-full px-3 py-2 text-left text-small leading-snug text-ink-dim transition-colors hover:text-ink focus:text-ink focus:outline-none"
                  >
                    {hit.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {hits && hits.length === 0 ? (
            <Hint>Nothing matched. Try adding the town or the postcode.</Hint>
          ) : null}
          <Hint>Looked up on OpenStreetMap and filled in below. Or type the coordinates yourself.</Hint>
        </>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <input
            value={value.lat}
            inputMode="decimal"
            placeholder="39.224209"
            onChange={(event) => onCoordinateInput('lat', event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Longitude">
          <input
            value={value.lon}
            inputMode="decimal"
            placeholder="-82.989314"
            onChange={(event) => onCoordinateInput('lon', event.target.value)}
            className={INPUT}
          />
        </Field>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-4">
        <Hint className="">Decimal degrees. South and west are negative.</Hint>
        <button type="button" onClick={useThisDevice} disabled={locating} className={GHOST}>
          {locating ? 'Locating…' : 'Use this device'}
        </button>
      </div>

      {error ? <ErrorLine className="mt-4">{error}</ErrorLine> : null}
    </div>
  );
}
