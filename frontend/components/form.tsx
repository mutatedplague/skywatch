'use client';

/**
 * The console's form vocabulary: a rule beneath each input, the accent on the
 * one primary action, and everything else set as quiet text. Shared by the
 * settings panel and the setup wizard so the two read as one instrument.
 */

export const INPUT =
  'data mt-1.5 w-full border-b border-hairline bg-transparent pb-1.5 text-base text-ink ' +
  'transition-colors placeholder:text-ink-dim/60 hover:border-hairline-lit ' +
  'focus:border-phosphor focus:outline-none';

export const PRIMARY =
  'border-b border-phosphor pb-0.5 text-base text-phosphor transition-colors ' +
  'hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-phosphor';

export const GHOST =
  'border-b border-transparent pb-0.5 text-small text-ink-dim transition-colors ' +
  'hover:border-hairline-lit hover:text-ink disabled:opacity-50';

export function Field({
  label,
  suffix,
  children,
  className = 'mt-6',
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="flex items-baseline justify-between text-micro text-ink-dim">
        {label}
        {suffix ? <span>{suffix}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Hint({ children, className = 'mt-2' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-micro leading-relaxed text-ink-dim ${className}`}>{children}</p>;
}

export function ErrorLine({ children, className = 'mt-6' }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={`border-l-2 border-emergency pl-3 text-small text-emergency ${className}`}>
      {children}
    </p>
  );
}
