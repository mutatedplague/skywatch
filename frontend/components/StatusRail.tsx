'use client';

import { useEffect, useState } from 'react';
import { formatClock, formatDistance } from '@/lib/format';
import type { FeedStats, LinkState, SiteConfig } from '@/lib/types';

interface StatusRailProps {
  config: SiteConfig | null;
  stats: FeedStats | null;
  /** Contacts inside the range the operator has selected. */
  inRange: number;
  link: LinkState;
  audio: boolean;
  onToggleAudio: () => void;
}

const LINK_COPY: Record<LinkState, string> = {
  connecting: 'linking',
  live: 'linked',
  lost: 'link lost',
};

export default function StatusRail({
  config,
  stats,
  inRange,
  link,
  audio,
  onToggleAudio,
}: StatusRailProps) {
  const [clock, setClock] = useState<string>('----:--Z');

  useEffect(() => {
    const tick = () => setClock(formatClock(Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const healthy = link === 'live' && stats?.sourceOk === true;
  const dot = healthy ? 'bg-phosphor' : link === 'connecting' ? 'bg-sodium' : 'bg-emergency';

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-hairline bg-console px-4 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-[1.05rem] font-bold tracking-[0.34em] text-phosphor">
          SKYWATCH
        </span>
        <span className="text-[0.68rem] text-ink-dim">
          {config ? config.site : 'no site'}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[0.72rem]">
        <span className={`inline-block h-1.5 w-1.5 ${dot} ${healthy ? '' : 'alert-pulse'}`} />
        <span className="text-ink">{config?.sourceLabel ?? 'no receiver'}</span>
        <span className="text-ink-dim">{LINK_COPY[link]}</span>
      </div>

      <dl className="flex items-center gap-5 text-[0.72rem]">
        <Field label="in range" value={String(inRange)} />
        <Field label="held" value={stats ? String(stats.tracked) : '—'} />
        <Field
          label="nearest"
          value={stats?.closestNm != null ? `${formatDistance(stats.closestNm)} nm` : '—'}
        />
        <Field label="latency" value={stats ? `${stats.latencyMs} ms` : '—'} />
      </dl>

      <div className="ml-auto flex items-center gap-4">
        {config?.simulated ? (
          <span className="chamfer-sm border border-sodium/50 bg-sodium/10 px-2 py-1 text-[0.62rem] tracking-[0.22em] text-sodium">
            SIMULATED TRAFFIC
          </span>
        ) : null}

        <button
          type="button"
          onClick={onToggleAudio}
          aria-pressed={audio}
          className="chamfer-sm border border-hairline px-2.5 py-1 text-[0.66rem] tracking-[0.18em] text-ink-dim transition-colors hover:border-hairline-lit hover:text-ink"
        >
          {audio ? 'tone on' : 'tone off'}
        </button>

        <span className="font-display text-[0.95rem] tracking-[0.12em] text-phosphor tabular-nums">
          {clock}
        </span>
      </div>
    </header>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-dim">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
