'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import BootSequence from '@/components/BootSequence';
import ContactCallout from '@/components/ContactCallout';
import HoloScope from '@/components/HoloScope';
import RadarScope, { type Symbology } from '@/components/RadarScope';
import { ScopeControls, ScopeLegend, SiteBlock } from '@/components/ScopeHud';
import SettingsPanel from '@/components/SettingsPanel';
import StatusRail, { type ScopeView } from '@/components/StatusRail';
import StripBay from '@/components/StripBay';
import { applyTheme, DEFAULT_THEME } from '@/lib/themes';
import { emptyPoint } from '@/lib/trackedPoint';
import { useContactTone } from '@/lib/useContactTone';
import { useRadarFeed } from '@/lib/useRadarFeed';

const RANGE_STEPS = [5, 10, 25, 50, 100, 150, 250];
const RANGE_KEY = 'skywatch.range';
const SYMBOLOGY_KEY = 'skywatch.symbology';
const VIEW_KEY = 'skywatch.view';
const TERRAIN_KEY = 'skywatch.terrain';
const THEME_KEY = 'skywatch.theme';

export default function Console() {
  const { snapshot, link, error } = useRadarFeed();
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [rangeNm, setRangeNm] = useState(50);
  const [symbology, setSymbology] = useState<Symbology>('icons');
  const [audio, setAudio] = useState(false);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<ScopeView>('scope');
  const [terrain, setTerrain] = useState<string>('relief');
  const [theme, setTheme] = useState<string>(DEFAULT_THEME);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Written by whichever view is mounted, read by the callout's own frame loop.
  const pointRef = useRef(emptyPoint());

  const config = snapshot?.config ?? null;
  const aircraft = useMemo(() => snapshot?.aircraft ?? [], [snapshot]);

  useContactTone(aircraft, audio);

  useEffect(() => {
    const storedRange = Number(window.localStorage.getItem(RANGE_KEY));
    if (Number.isFinite(storedRange) && storedRange > 0) setRangeNm(storedRange);
    const storedSymbology = window.localStorage.getItem(SYMBOLOGY_KEY);
    if (storedSymbology === 'icons' || storedSymbology === 'blips') setSymbology(storedSymbology);
    const storedView = window.localStorage.getItem(VIEW_KEY);
    if (storedView === 'scope' || storedView === 'holo') setView(storedView);
    const storedTerrain = window.localStorage.getItem(TERRAIN_KEY);
    if (storedTerrain) setTerrain(storedTerrain);
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    if (storedTheme) setTheme(storedTheme);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RANGE_KEY, String(rangeNm));
  }, [rangeNm]);

  useEffect(() => {
    window.localStorage.setItem(SYMBOLOGY_KEY, symbology);
  }, [symbology]);

  useEffect(() => {
    window.localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem(TERRAIN_KEY, terrain);
  }, [terrain]);

  // Repaints the CSS custom properties and the palette the canvas layers read.
  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Never let the scope zoom past what the receiver is actually pulling.
  useEffect(() => {
    if (config && rangeNm > config.rangeNm) setRangeNm(config.rangeNm);
  }, [config, rangeNm]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The settings panel swallows Escape for itself.
      if (event.key === 'Escape' && !settingsOpen) setSelectedHex(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

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

      {settingsOpen && config ? (
        <SettingsPanel config={config} onClose={() => setSettingsOpen(false)} />
      ) : null}

      <main className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
        <StatusRail
          config={config}
          stats={snapshot?.stats ?? null}
          inRange={visible.length}
          link={link}
          audio={audio}
          onToggleAudio={() => setAudio((on) => !on)}
          view={view}
          onView={setView}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 max-lg:aspect-square">
              {view === 'holo' ? (
                <HoloScope
                  aircraft={visible}
                  config={config}
                  rangeNm={rangeNm}
                  selectedHex={selectedHex}
                  terrain={terrain}
                  theme={theme}
                  pointRef={pointRef}
                  onSelect={setSelectedHex}
                />
              ) : (
                <RadarScope
                  aircraft={visible}
                  config={config}
                  rangeNm={rangeNm}
                  selectedHex={selectedHex}
                  symbology={symbology}
                  terrain={terrain}
                  pointRef={pointRef}
                  onSelect={setSelectedHex}
                />
              )}

              {/* On wide screens the console furniture fills the corners the
                  circular scope cannot reach. */}
              <div className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
                <ScopeControls
                  className="pointer-events-auto absolute left-8 top-8"
                  rangeOptions={rangeOptions}
                  rangeNm={rangeNm}
                  onRange={setRangeNm}
                  symbology={symbology}
                  onSymbology={setSymbology}
                  showSymbology={view === 'scope'}
                  terrain={terrain}
                  onTerrain={setTerrain}
                  theme={theme}
                  onTheme={setTheme}
                />
                <SiteBlock
                  config={config}
                  onEdit={() => setSettingsOpen(true)}
                  className="pointer-events-auto absolute bottom-8 left-8 max-w-[17rem]"
                />
                <ScopeLegend terrain={terrain} className="absolute bottom-8 right-8 text-right" />
              </div>

              <ContactCallout
                aircraft={selected}
                now={snapshot?.now ?? Date.now()}
                pointRef={pointRef}
                onClose={() => setSelectedHex(null)}
              />

              {link !== 'live' && !snapshot ? (
                <p className="absolute inset-x-0 bottom-8 text-center text-small text-ink-dim">
                  {error ?? 'Connecting to the receiver…'}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-t border-hairline px-6 py-4 lg:hidden">
              <ScopeControls
                rangeOptions={rangeOptions}
                rangeNm={rangeNm}
                onRange={setRangeNm}
                symbology={symbology}
                onSymbology={setSymbology}
                showSymbology={view === 'scope'}
                terrain={terrain}
                onTerrain={setTerrain}
                theme={theme}
                onTheme={setTheme}
              />
              <ScopeLegend terrain={terrain} />
            </div>
          </section>

          <aside className="min-h-0 shrink-0 lg:w-[24rem]">
            <StripBay
              aircraft={visible}
              config={config}
              selectedHex={selectedHex}
              onSelect={(hex) => setSelectedHex((current) => (current === hex ? null : hex))}
            />
          </aside>
        </div>

        {snapshot?.stats?.error ? (
          <p className="shrink-0 border-t border-hairline px-6 py-3 text-small text-emergency">
            Receiver: {snapshot.stats.error}
          </p>
        ) : null}
      </main>
    </>
  );
}
