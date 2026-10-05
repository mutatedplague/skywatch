'use client';

import { useState } from 'react';
import { saveSite, type SitePatch } from '@/lib/api';
import { sourceInfo } from '@/lib/sources';
import type { SiteConfig, SourceName } from '@/lib/types';
import { ErrorLine, Field, GHOST, Hint, INPUT, PRIMARY } from './form';
import PositionFields, { parsePosition, type PositionValue } from './PositionFields';
import SourceFields, { type SourceValue } from './SourceFields';

const STEPS = ['Station', 'Receiver', 'Alert volume', 'Review'] as const;

interface SetupWizardProps {
  config: SiteConfig;
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * First run. Four questions, each one screen, and the scope is live at the
 * end. The same fields as the settings panel, just asked in order and with
 * enough words around them that nobody has to read the README first.
 */
export default function SetupWizard({ config, onComplete, onSkip }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [site, setSite] = useState(config.site);
  const [position, setPosition] = useState<PositionValue>({ lat: '', lon: '', address: '' });
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

  const parsedPosition = parsePosition(position);
  const range = Number(rangeNm);
  const radius = Number(alertRadiusNm);
  const ceiling = Number(alertAltitudeFt);
  const volumeOk =
    range >= 5 && range <= 250 && radius >= 0.25 && radius <= range && ceiling >= 500 && ceiling <= 60000;

  const canContinue = [
    site.trim() !== '' && site.trim().length <= 24 && parsedPosition !== null,
    true,
    volumeOk,
    !busy,
  ][step];

  const finish = async () => {
    if (!parsedPosition) return;
    const patch: SitePatch = {
      site: site.trim(),
      lat: parsedPosition.lat,
      lon: parsedPosition.lon,
      address: position.address,
      source: source.source,
      rangeNm: range,
      alertRadiusNm: radius,
      alertAltitudeFt: ceiling,
    };
    if (source.source === 'dump1090' && source.dump1090Url.trim() !== '') {
      patch.dump1090Url = source.dump1090Url.trim();
    }
    if (source.source === 'opensky') {
      patch.openskyClientId = source.openskyClientId.trim();
      if (source.openskyClientSecret !== '') patch.openskyClientSecret = source.openskyClientSecret;
    }
    setBusy(true);
    setError(null);
    try {
      await saveSite(patch);
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'the receiver refused the setup');
      setBusy(false);
    }
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canContinue) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      setError(null);
    } else {
      void finish();
    }
  };

  const feed = sourceInfo(source.source);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-void" role="dialog" aria-label="Station setup">
      <div className="mx-auto flex min-h-full w-full max-w-[64rem] flex-col gap-10 px-6 py-10 lg:flex-row lg:gap-20 lg:py-16">
        <aside className="shrink-0 lg:w-52">
          <p className="text-large font-medium tracking-tight text-ink">Skywatch</p>
          <p className="mt-1 text-small text-ink-dim">Station setup</p>

          <ol className="mt-8 flex gap-6 lg:mt-12 lg:flex-col lg:gap-3">
            {STEPS.map((label, index) => {
              const state = index === step ? 'current' : index < step ? 'done' : 'ahead';
              return (
                <li
                  key={label}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={`flex items-baseline gap-3 text-small ${
                    state === 'current' ? 'text-phosphor' : state === 'done' ? 'text-ink' : 'text-ink-dim'
                  }`}
                >
                  <span className="data text-micro">{String(index + 1).padStart(2, '0')}</span>
                  <span className={state === 'current' ? 'border-b border-phosphor pb-0.5' : ''}>{label}</span>
                </li>
              );
            })}
          </ol>

          <button type="button" onClick={onSkip} className={`${GHOST} mt-8 hidden lg:inline-block`}>
            Skip for now — watch simulated traffic
          </button>
        </aside>

        <form onSubmit={onSubmit} className="w-full max-w-[34rem] flex-1">
          {step === 0 ? (
            <section>
              <h2 className="text-large font-medium tracking-tight text-ink">Where is the antenna?</h2>
              <p className="mt-2 max-w-[46ch] text-small leading-relaxed text-ink-dim">
                Range, bearing and the alert volume are all measured from this spot, so the rooftop
                is the right answer rather than the town. Nothing you enter here leaves this receiver.
              </p>

              <Field label="Station name" className="mt-8">
                <input
                  value={site}
                  autoFocus
                  maxLength={24}
                  placeholder="HOME"
                  onChange={(event) => setSite(event.target.value)}
                  className={INPUT}
                />
              </Field>
              <Hint>Shown on the console. Short: a callsign, a street, a rooftop.</Hint>

              <PositionFields
                value={position}
                onChange={setPosition}
                addressLookup={config.addressLookup}
              />
            </section>
          ) : null}

          {step === 1 ? (
            <section>
              <h2 className="text-large font-medium tracking-tight text-ink">
                Where do the aircraft come from?
              </h2>
              <p className="mt-2 max-w-[46ch] text-small leading-relaxed text-ink-dim">
                Your own RTL-SDR gives the truest picture of your sky. A community network needs
                nothing at all and is the right place to start if the dongle has not arrived yet.
              </p>
              <div className="mt-8">
                <SourceFields
                  value={source}
                  onChange={setSource}
                  position={parsedPosition}
                  rangeNm={range}
                  openskyHasSecret={config.openskyHasSecret}
                  autoProbe
                />
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h2 className="text-large font-medium tracking-tight text-ink">What counts as overhead?</h2>
              <p className="mt-2 max-w-[46ch] text-small leading-relaxed text-ink-dim">
                A contact inside this radius <em className="not-italic text-ink">and</em> below this
                height turns amber on the scope and goes to the top of the list. Three miles and
                twelve thousand feet catches anything on approach without flagging the airway
                traffic passing over at cruise.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <Field label="Alert radius" suffix="nm" className="">
                  <input
                    value={alertRadiusNm}
                    inputMode="decimal"
                    autoFocus
                    onChange={(event) => setAlertRadiusNm(event.target.value)}
                    className={INPUT}
                  />
                </Field>
                <Field label="Alert ceiling" suffix="ft" className="">
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
              <Hint>
                How far out traffic is pulled, 5 to 250 nm. The scope zooms within it. A good
                antenna on a roof sees 150 nm or more; indoors, expect 40.
              </Hint>
              {!volumeOk ? (
                <Hint className="mt-3 text-sodium">
                  Range must be 5–250 nm, the alert radius within the range, and the ceiling
                  500–60,000 ft.
                </Hint>
              ) : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section>
              <h2 className="text-large font-medium tracking-tight text-ink">Ready to go live</h2>
              <p className="mt-2 max-w-[46ch] text-small leading-relaxed text-ink-dim">
                This is saved on the receiver, so every console that connects sees the same station.
                All of it can be changed later under <span className="text-ink">Settings</span> in
                the top rail.
              </p>

              <dl className="mt-8 border-t border-hairline">
                <Row label="Station" value={site.trim()} />
                {position.address ? <Row label="Address" value={position.address} /> : null}
                <Row
                  label="Position"
                  value={
                    parsedPosition
                      ? `${parsedPosition.lat.toFixed(5)}, ${parsedPosition.lon.toFixed(5)}`
                      : '—'
                  }
                />
                <Row
                  label="Receiver"
                  value={
                    feed
                      ? source.source === 'dump1090'
                        ? `${feed.name} — ${source.dump1090Url.trim() || config.dump1090Url}`
                        : feed.name
                      : source.source
                  }
                />
                <Row label="Range" value={`${range} nm`} />
                <Row label="Alert volume" value={`${radius} nm, below ${ceiling.toLocaleString('en-US')} ft`} />
              </dl>
            </section>
          ) : null}

          {error ? <ErrorLine>{error}</ErrorLine> : null}

          <div className="mt-10 flex items-baseline gap-6">
            <button type="submit" disabled={!canContinue} className={PRIMARY}>
              {step === STEPS.length - 1 ? (busy ? 'Starting…' : 'Start the scope') : 'Continue'}
            </button>
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)} disabled={busy} className={GHOST}>
                Back
              </button>
            ) : null}
            <button type="button" onClick={onSkip} className={`${GHOST} ml-auto lg:hidden`}>
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 border-b border-hairline py-2.5 text-small">
      <dt className="w-28 shrink-0 text-ink-dim">{label}</dt>
      <dd className="data min-w-0 break-words text-ink">{value}</dd>
    </div>
  );
}
