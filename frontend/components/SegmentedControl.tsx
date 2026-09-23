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
  onChange: (value: T) => void;
}

/** A detented switch, the way a range or symbology control sits on a console. */
export default function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  suffix,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.62rem] tracking-[0.18em] text-ink-dim">{label}</span>
      <div className="flex border border-hairline" role="group" aria-label={label}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`min-w-11 border-r border-hairline px-2 py-1 text-[0.7rem] tabular-nums transition-colors last:border-r-0 ${
                active
                  ? 'bg-phosphor/15 text-phosphor'
                  : 'text-ink-dim hover:bg-phosphor/5 hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {suffix ? <span className="text-[0.62rem] text-ink-dim">{suffix}</span> : null}
    </div>
  );
}
