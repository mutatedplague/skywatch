'use client';

import { useEffect, useMemo, useState } from 'react';
import BootSequence from '@/components/BootSequence';
import RadarScope, { type Symbology } from '@/components/RadarScope';
import Readout from '@/components/Readout';
import { ScopeControls, ScopeLegend, SiteBlock } from '@/components/ScopeHud';
import StatusRail from '@/components/StatusRail';
import StripBay from '@/components/StripBay';
import { useContactTone } from '@/lib/useContactTone';
import { useRadarFeed } from '@/lib/useRadarFeed';

const RANGE_STEPS = [5, 10, 25, 50, 100, 150, 250];
const RANGE_KEY = 'skywatch.range';
const SYMBOLOGY_KEY = 'skywatch.symbology';

export default function Console() {
  const { snapshot, link, error } = useRadarFeed();
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [rangeNm, setRangeNm] = useState(50);
  const [symbology, setSymbology] = useState<Symbology>('icons');
  const [audio, setAudio] = useState(false);
  const [booting, setBooting] = useState(true);

  const config = snapshot?.config ?? null;
  const aircraft = useMemo(() => snapshot?.aircraft ?? [], [snapshot]);

  useContactTone(aircraft, audio);

  useEffect(() => {
    const storedRange = Number(window.localStorage.getItem(RANGE_KEY));
    if (Number.isFinite(storedRange) && storedRange > 0) setRangeNm(storedRange);
    const storedSymbology = window.localStorage.getItem(SYMBOLOGY_KEY);
    if (storedSymbology === 'icons' || storedSymbology === 'blips') setSymbology(storedSymbology);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RANGE_KEY, String(rangeNm));
  }, [rangeNm]);

  useEffect(() => {
    window.localStorage.setItem(SYMBOLOGY_KEY, symbology);
  }, [symbology]);

  // Never let the scope zoom past what the receiver is actually pulling.
  useEffect(() => {
    if (config && rangeNm > config.rangeNm) setRangeNm(config.rangeNm);
  }, [config, rangeNm]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedHex(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rangeOptions = useMemo(() => {
    const cap = config?.rangeNm ?? 100;
    const steps = RANGE_STEPS.filter((step) => step <= cap);
    if (steps.length === 0 || (steps[steps.length - 1] as number) < cap) steps.push(cap);
    return steps.slice(-5).map((step) => ({ value: step, label: String(step) }));
  }, [config]);

  const visible = useMemo(
    () => aircraft.filter((contact) => contact.distanceNm <= rangeNm),
    [aircraft, rangeNm],
  );

  const selected = useMemo(
    () => aircraft.find((contact) => contact.hex === selectedHex) ?? null,
    [aircraft, selectedHex],
  );

  // A contact that leaves the airspace should not stay latched in the readout.
  useEffect(() => {
    if (selectedHex && !aircraft.some((contact) => contact.hex === selectedHex)) {
      setSelectedHex(null);
    }
  }, [aircraft, selectedHex]);

  return (
    <>
      {booting ? <BootSequence config={config} onComplete={() => setBooting(false)} /> : null}

      <main className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
        <StatusRail
          config={config}
          stats={snapshot?.stats ?? null}
          inRange={visible.length}
          link={link}
          audio={audio}
          onToggleAudio={() => setAudio((on) => !on)}
        />

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 p-3 max-lg:aspect-square">
              <RadarScope
                aircraft={visible}
                config={config}
                rangeNm={rangeNm}
                selectedHex={selectedHex}
                symbology={symbology}
                onSelect={setSelectedHex}
              />

              {/* On wide screens the console furniture fills the corners the
                  circular scope cannot reach. */}
              <div className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
                <ScopeControls
                  className="pointer-events-auto absolute left-6 top-6"
                  rangeOptions={rangeOptions}
                  rangeNm={rangeNm}
                  onRange={setRangeNm}
                  symbology={symbology}
                  onSymbology={setSymbology}
                />
                <SiteBlock config={config} className="absolute bottom-6 left-6 max-w-[15rem]" />
                <ScopeLegend className="absolute bottom-6 right-6 text-right" />
              </div>

              {link !== 'live' && !snapshot ? (
                <p className="absolute inset-x-0 bottom-6 text-center text-[0.72rem] text-ink-dim">
                  {error ?? 'Linking to receiver…'}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-hairline bg-console px-4 py-2 lg:hidden">
              <ScopeControls
                rangeOptions={rangeOptions}
                rangeNm={rangeNm}
                onRange={setRangeNm}
                symbology={symbology}
                onSymbology={setSymbology}
              />
              <ScopeLegend />
            </div>
          </section>

          <aside className="min-h-0 shrink-0 lg:w-[23rem]">
            <StripBay
              aircraft={visible}
              config={config}
              selectedHex={selectedHex}
              onSelect={(hex) => setSelectedHex((current) => (current === hex ? null : hex))}
            />
          </aside>
        </div>

        <Readout
          aircraft={selected}
          stats={snapshot?.stats ?? null}
          now={snapshot?.now ?? Date.now()}
        />
      </main>
    </>
  );
}
