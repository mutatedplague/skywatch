'use client';

import { useEffect, useState } from 'react';
import { formatClock, formatDistance } from '@/lib/format';
import type { FeedStats, LinkState, SiteConfig } from '@/lib/types';

const LINK_BUTTON =
  'border-b border-transparent pb-0.5 text-small text-ink-dim transition-colors hover:border-hairline-lit hover:text-ink';

interface StatusRailProps {
  config: SiteConfig | null;
  stats: FeedStats | null;
  /** Contacts inside the range the operator has selected. */
  inRange: number;
  link: LinkState;
  audio: boolean;
  onToggleAudio: () => void;
  onOpenSettings: () => void;
  /** The first-run wizard, for a receiver that has no position at all yet. */
  onOpenSetup: () => void;
}

const LINK_COPY: Record<LinkState, string> = {
  connecting: 'Connecting',
  live: 'Live',
  lost: 'Disconnected',
};

export default function StatusRail({
  config,
  stats,
  inRange,
  link,
  audio,
  onToggleAudio,
  onOpenSettings,
  onOpenSetup,
}: StatusRailProps) {
  const [clock, setClock] = useState<string>('--:--');

  useEffect(() => {
    const tick = () => setClock(formatClock(Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const healthy = link === 'live' && stats?.sourceOk === true;
  const dot = healthy ? 'bg-phosphor' : link === 'connecting' ? 'bg-sodium' : 'bg-emergency';

  return (
    <header className="flex shrink-0 flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-hairline px-6 py-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-large font-medium tracking-tight text-ink">Skywatch</h1>
        <span className="data text-small text-ink-dim">{config ? config.site : 'No site'}</span>
      </div>

      <div className="flex items-baseline gap-2 text-small">
        <span className={`inline-block h-1.5 w-1.5 translate-y-[-1px] ${dot}`} />
        <span className="text-ink">{config?.sourceLabel ?? 'No receiver'}</span>
        <span className="text-ink-dim">{LINK_COPY[link]}</span>
      </div>

      <dl className="flex items-baseline gap-7 text-small">
        <Field label="In range" value={String(inRange)} />
        <Field label="Held" value={stats ? String(stats.tracked) : '—'} />
        <Field
          label="Nearest"
          value={stats?.closestNm != null ? `${formatDistance(stats.closestNm)} nm` : '—'}
        />
        <Field label="Latency" value={stats ? `${stats.latencyMs} ms` : '—'} />
      </dl>

      <div className="ml-auto flex items-baseline gap-6">
        {config?.simulated && config.siteEditable ? (
          <button
            type="button"
            onClick={config.positionSource === 'none' ? onOpenSetup : onOpenSettings}
            className="border-b border-sodium pb-0.5 text-small text-sodium transition-colors hover:text-ink"
          >
            {config.positionSource === 'none'
              ? 'Simulated traffic — set up the station'
              : 'Simulated traffic — choose a receiver'}
          </button>
        ) : null}

        {config?.siteEditable !== false ? (
          <button type="button" onClick={onOpenSettings} className={LINK_BUTTON}>
            Settings
          </button>
        ) : null}

        <button type="button" onClick={onToggleAudio} aria-pressed={audio} className={LINK_BUTTON}>
          {audio ? 'Tone on' : 'Tone off'}
        </button>

        <span className="data text-mid text-ink">{clock}</span>
      </div>
    </header>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-dim">{label}</dt>
      <dd className="data text-ink">{value}</dd>
    </div>
  );
}
