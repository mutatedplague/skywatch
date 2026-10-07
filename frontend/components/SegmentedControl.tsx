'use client';

export interface Segment<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  label: string;
  options: Segment<T>[];
  value: T;
  suffix?: string;
  /** Keep the label for assistive technology only, where the options speak for themselves. */
  labelHidden?: boolean;
  onChange: (value: T) => void;
}

/**
 * Options set in a row, with the active one marked by the accent and a rule
 * beneath it. No boxes: the alignment and the rule carry the structure.
 */
export default function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  suffix,
  labelHidden = false,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex items-baseline gap-3">
      {labelHidden ? null : <span className="w-14 shrink-0 text-micro text-ink-dim">{label}</span>}
      <div className="flex items-baseline gap-3" role="group" aria-label={label}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`border-b pb-0.5 text-small tabular-nums transition-colors ${
                active
                  ? 'border-phosphor text-phosphor'
                  : 'border-transparent text-ink-dim hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {suffix ? <span className="text-micro text-ink-dim">{suffix}</span> : null}
    </div>
  );
}
