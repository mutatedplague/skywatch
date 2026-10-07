'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BootSequence from '@/components/BootSequence';
import ContactCallout from '@/components/ContactCallout';
import HoloScope from '@/components/HoloScope';
import { ScopeControls, ScopeLegend, SiteBlock } from '@/components/ScopeHud';
import SettingsPanel from '@/components/SettingsPanel';
import SetupWizard from '@/components/SetupWizard';
import StatusRail from '@/components/StatusRail';
import StripBay from '@/components/StripBay';
import {
  applyTheme,
  DEFAULT_MODE,
  DEFAULT_THEME,
  isMode,
  MODE_KEY,
  type Mode,
  preferredMode,
  THEME_KEY,
} from '@/lib/themes';
import { emptyPoint } from '@/lib/trackedPoint';
import { useContactTone } from '@/lib/useContactTone';
import { useRadarFeed } from '@/lib/useRadarFeed';

const RANGE_STEPS = [5, 10, 25, 50, 100, 150, 250];
const RANGE_KEY = 'skywatch.range';
const TERRAIN_KEY = 'skywatch.terrain';
const SETUP_KEY = 'skywatch.setup';

/** This browser's own look: the mode and the accent. */
interface Look {
  theme: string;
  mode: Mode;
}

export default function Console() {
  const { snapshot, link, error } = useRadarFeed();
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [rangeNm, setRangeNm] = useState(50);
  const [audio, setAudio] = useState(false);
  const [booting, setBooting] = useState(true);
  const [terrain, setTerrain] = useState<string>('relief');
  // Unknown until mounted: the pre-paint script in the layout has already
  // dressed the page from storage, and nothing should repaint over it blind.
  const [look, setLook] = useState<Look | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Reported by the scene so the legend can say when the ground is drawn taller than true.
  const [reliefFactor, setReliefFactor] = useState(1);
  // Undecided until the first config arrives: a receiver with no position
  // anywhere gets the setup wizard, unless this browser skipped it before.
  const [setup, setSetup] = useState<'pending' | 'open' | 'closed'>('pending');
  // Written by the scene each frame, read by the callout's own frame loop.
  const pointRef = useRef(emptyPoint());

  const config = snapshot?.config ?? null;
  const aircraft = useMemo(() => snapshot?.aircraft ?? [], [snapshot]);

  useContactTone(aircraft, audio);

  useEffect(() => {
    if (setup !== 'pending' || !config) return;
    const skipped = window.localStorage.getItem(SETUP_KEY) === 'skipped';
    const needed = config.positionSource === 'none' && config.siteEditable && !skipped;
    setSetup(needed ? 'open' : 'closed');
  }, [config, setup]);

  const openSetup = () => {
    window.localStorage.removeItem(SETUP_KEY);
    setSetup('open');
  };

  const skipSetup = () => {
    window.localStorage.setItem(SETUP_KEY, 'skipped');
    setSetup('closed');
  };

  // Repaints the CSS custom properties and the palette the scene reads. Done
  // before the state lands rather than in an effect: the scene rebuilds in
  // its own effect, which runs before this component's, and it must find the
  // new palette already in place.
  const adopt = useCallback((next: Look) => {
    applyTheme(next.theme, next.mode);
    window.localStorage.setItem(THEME_KEY, next.theme);
    window.localStorage.setItem(MODE_KEY, next.mode);
    setLook(next);
  }, []);

  useEffect(() => {
    const storedRange = Number(window.localStorage.getItem(RANGE_KEY));
    if (Number.isFinite(storedRange) && storedRange > 0) setRangeNm(storedRange);
    const storedTerrain = window.localStorage.getItem(TERRAIN_KEY);
    if (storedTerrain) setTerrain(storedTerrain);
    const storedMode = window.localStorage.getItem(MODE_KEY);
    adopt({
      theme: window.localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME,
      mode: isMode(storedMode) ? storedMode : preferredMode(),
    });
  }, [adopt]);

  useEffect(() => {
    window.localStorage.setItem(RANGE_KEY, String(rangeNm));
  }, [rangeNm]);

  useEffect(() => {
    window.localStorage.setItem(TERRAIN_KEY, terrain);
  }, [terrain]);

  const theme = look?.theme ?? DEFAULT_THEME;
  const mode = look?.mode ?? DEFAULT_MODE;
  const setTheme = (next: string) => adopt({ theme: next, mode });
  const setMode = (next: Mode) => adopt({ theme, mode: next });

  // Never let the view zoom past what the receiver is actually pulling.
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

      {/* Sits under the boot overlay, so the power-on sequence fades into it. */}
      {setup === 'open' && config ? (
        <SetupWizard config={config} onComplete={() => setSetup('closed')} onSkip={skipSetup} />
      ) : null}

      {settingsOpen && config ? (
        <SettingsPanel
          config={config}
          theme={theme}
          mode={mode}
          onTheme={setTheme}
          onMode={setMode}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      <main className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
        <StatusRail
          config={config}
          stats={snapshot?.stats ?? null}
          inRange={visible.length}
          link={link}
          audio={audio}
          mode={mode}
          onMode={setMode}
          onToggleAudio={() => setAudio((on) => !on)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSetup={openSetup}
        />

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 max-lg:aspect-square">
              <HoloScope
                aircraft={visible}
                config={config}
                rangeNm={rangeNm}
                selectedHex={selectedHex}
                terrain={terrain}
                look={look ? `${look.mode}/${look.theme}` : ''}
                pointRef={pointRef}
                onSelect={setSelectedHex}
                onRelief={setReliefFactor}
              />

              {/* On wide screens the console furniture fills the corners the
                  disc cannot reach. */}
              <div className="hud pointer-events-none absolute inset-0 z-10 hidden lg:block">
                <ScopeControls
                  className="pointer-events-auto absolute left-8 top-8"
                  rangeOptions={rangeOptions}
                  rangeNm={rangeNm}
                  onRange={setRangeNm}
                  terrain={terrain}
                  onTerrain={setTerrain}
                />
                <SiteBlock
                  config={config}
                  onEdit={() => setSettingsOpen(true)}
                  className="pointer-events-auto absolute bottom-8 left-8 max-w-[17rem]"
                />
                <ScopeLegend
                  terrain={terrain}
                  reliefFactor={reliefFactor}
                  className="absolute bottom-8 right-8 text-right"
                />
              </div>

              <ContactCallout
                aircraft={selected}
                now={snapshot?.now ?? Date.now()}
                pointRef={pointRef}
                onClose={() => setSelectedHex(null)}
              />

              {link !== 'live' && !snapshot ? (
                <p className="hud absolute inset-x-0 bottom-8 text-center text-small text-ink-dim">
                  {error ?? 'Connecting to the receiver…'}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-t border-hairline px-6 py-4 lg:hidden">
              <ScopeControls
                rangeOptions={rangeOptions}
                rangeNm={rangeNm}
                onRange={setRangeNm}
                terrain={terrain}
                onTerrain={setTerrain}
              />
              <ScopeLegend terrain={terrain} reliefFactor={reliefFactor} />
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
