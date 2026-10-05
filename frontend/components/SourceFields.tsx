'use client';

import { useEffect, useRef, useState } from 'react';
import { type SourceProbeRequest, testSource } from '@/lib/api';
import { SOURCE_INFO } from '@/lib/sources';
import type { SourceName, SourceProbe } from '@/lib/types';
import { Field, GHOST, Hint, INPUT } from './form';

export interface SourceValue {
  source: SourceName;
  dump1090Url: string;
  openskyClientId: string;
  /** Only ever what the operator typed this time; a saved secret never comes back. */
  openskyClientSecret: string;
}

interface SourceFieldsProps {
  value: SourceValue;
  onChange: (next: SourceValue) => void;
  /** Where a test measures from. Without one the feeds are tried around 0°, 0°. */
  position: { lat: number; lon: number } | null;
  rangeNm: number;
  openskyHasSecret: boolean;
  /**
   * Try the initial choice as soon as the fields appear, and fall back to a
   * community feed if a local receiver does not answer. For the first run,
   * where the operator has not chosen anything yet.
   */
  autoProbe?: boolean;
}

function probeRequest(
  value: SourceValue,
  position: { lat: number; lon: number } | null,
  rangeNm: number,
): SourceProbeRequest {
  const request: SourceProbeRequest = { source: value.source, rangeNm };
  if (position) {
    request.lat = position.lat;
    request.lon = position.lon;
  }
  if (value.source === 'dump1090' && value.dump1090Url.trim() !== '') {
    request.dump1090Url = value.dump1090Url.trim();
  }
  if (value.source === 'opensky') {
    request.openskyClientId = value.openskyClientId.trim();
    if (value.openskyClientSecret !== '') request.openskyClientSecret = value.openskyClientSecret;
  }
  return request;
}

/** The feed list, the settings the chosen feed needs, and a way to try it. */
export default function SourceFields({
  value,
  onChange,
  position,
  rangeNm,
  openskyHasSecret,
  autoProbe = false,
}: SourceFieldsProps) {
  const [probe, setProbe] = useState<SourceProbe | null>(null);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const probedRef = useRef(false);

  const runTest = async (candidate: SourceValue): Promise<SourceProbe | null> => {
    setTesting(true);
    try {
      const result = await testSource(probeRequest(candidate, position, rangeNm));
      setProbe(result);
      return result;
    } catch (cause) {
      setProbe({
        ok: false,
        source: candidate.source,
        label: '',
        aircraft: 0,
        inRange: 0,
        latencyMs: 0,
        error: cause instanceof Error ? cause.message : 'the receiver could not run the test',
      });
      return null;
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (!autoProbe || probedRef.current) return;
    probedRef.current = true;
    void runTest(value).then((result) => {
      if (!result || result.ok) return;
      if (value.source !== 'dump1090') return;
      // The compose default points at a receiver container that may not be
      // running. Rather than start on a dead feed, fall back to one that
      // needs nothing, and say so.
      onChange({ ...value, source: 'adsblol' });
      setProbe(null);
      setNote(
        `No receiver answered at ${value.dump1090Url || 'the configured address'}, so adsb.lol is selected for now. Choose your own receiver once it is running.`,
      );
    });
    // Runs once, for the initial choice only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (source: SourceName) => {
    if (source === value.source) return;
    onChange({ ...value, source });
    setProbe(null);
    setNote(null);
  };

  const update = (patch: Partial<SourceValue>) => {
    onChange({ ...value, ...patch });
    setProbe(null);
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Aircraft feed" className="border-t border-hairline">
        {SOURCE_INFO.map((info) => {
          const active = info.id === value.source;
          return (
            <button
              key={info.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(info.id)}
              className={`block w-full border-b border-l-2 border-b-hairline py-3 pl-4 pr-2 text-left transition-colors ${
                active ? 'border-l-phosphor' : 'border-l-transparent hover:border-l-hairline-lit'
              }`}
            >
              <span className="flex items-baseline justify-between gap-4">
                <span className={`text-base ${active ? 'text-ink' : 'text-ink-dim'}`}>{info.name}</span>
                <span className="shrink-0 text-micro text-ink-dim">{info.needs}</span>
              </span>
              <span className="mt-1 block max-w-[48ch] text-small leading-relaxed text-ink-dim">
                {info.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {value.source === 'dump1090' ? (
        <>
          <Field label="aircraft.json address">
            <input
              value={value.dump1090Url}
              placeholder="http://192.168.1.50:8080/data/aircraft.json"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => update({ dump1090Url: event.target.value })}
              className={INPUT}
            />
          </Field>
          <Hint>
            The bundled container is at <span className="data">http://dump1090:8080/data/aircraft.json</span>.
            A decoder on this machine outside Docker is reachable as{' '}
            <span className="data">host.docker.internal</span>; a Raspberry Pi by its address on
            your network.
          </Hint>
        </>
      ) : null}

      {value.source === 'opensky' ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Client ID">
              <input
                value={value.openskyClientId}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => update({ openskyClientId: event.target.value })}
                className={INPUT}
              />
            </Field>
            <Field label="Client secret">
              <input
                type="password"
                value={value.openskyClientSecret}
                placeholder={openskyHasSecret ? 'Saved — leave blank to keep' : ''}
                autoComplete="new-password"
                onChange={(event) => update({ openskyClientSecret: event.target.value })}
                className={INPUT}
              />
            </Field>
          </div>
          <Hint>
            Create an API client under your account at opensky-network.org. Leave both blank for
            anonymous access, which updates every ten seconds.
          </Hint>
        </>
      ) : null}

      <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={() => void runTest(value)}
          disabled={testing}
          className={GHOST}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {probe ? <ProbeResult probe={probe} rangeNm={rangeNm} /> : null}
      </div>
      {note ? <Hint className="mt-3 text-sodium">{note}</Hint> : null}
    </div>
  );
}

function ProbeResult({ probe, rangeNm }: { probe: SourceProbe; rangeNm: number }) {
  if (!probe.ok) {
    return <span className="text-small text-emergency">{probe.error ?? 'no answer'}</span>;
  }
  const summary =
    probe.source === 'demo'
      ? `Simulator ready, ${probe.aircraft} aircraft`
      : probe.aircraft === 0
        ? 'Connected, but no aircraft reported right now'
        : `Found ${probe.aircraft} aircraft, ${probe.inRange} within ${rangeNm} nm`;
  return (
    <span className="text-small">
      <span className={probe.aircraft === 0 && probe.source !== 'demo' ? 'text-sodium' : 'text-phosphor'}>
        {summary}
      </span>
      <span className="data ml-3 text-ink-dim">{probe.latencyMs} ms</span>
    </span>
  );
}
