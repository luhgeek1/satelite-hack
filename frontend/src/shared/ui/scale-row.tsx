'use client';

import { cn, formatDegrees } from '@/shared/lib';

interface ScaleRowProps {
  id: string;
  label: string;
  value: number;
  max: number;
  step: number;
  ticks: number;
  majorEvery: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

export function ScaleRow({
  id,
  label,
  value,
  max,
  step,
  ticks,
  majorEvery,
  disabled,
  onChange,
  onCommit,
}: ScaleRowProps) {
  return (
    <div className={cn('flex items-center gap-2.5', disabled && 'opacity-50')}>
      <label
        htmlFor={id}
        className="w-[3.5rem] flex-shrink-0 whitespace-nowrap font-data text-[10px] tracking-[0.06em] text-zinc-500"
      >
        {label}
      </label>

      <div className="relative h-[15px] min-w-0 flex-1">
        <div
          className="pointer-events-none absolute inset-x-[5px] top-1/2 flex items-start justify-between"
          aria-hidden="true"
        >
          {Array.from({ length: ticks }).map((_, index) => (
            <span
              key={index}
              className={cn('w-px', index % majorEvery === 0 ? 'h-[6px] bg-zinc-700' : 'h-[3px] bg-zinc-800')}
            />
          ))}
        </div>

        <input
          id={id}
          type="range"
          className="param-scale absolute inset-0 w-full"
          style={{ ['--fill' as string]: `${(value / max) * 100}%` }}
          min={0}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(parseFloat(event.target.value))}
          onPointerUp={(event) => onCommit?.(parseFloat((event.target as HTMLInputElement).value))}
          onKeyUp={(event) => onCommit?.(parseFloat((event.target as HTMLInputElement).value))}
        />
      </div>

      <span className="w-[3.25rem] flex-shrink-0 text-right font-data text-[11px] tabular-nums text-zinc-200">
        {formatDegrees(value)}
        <span className="text-zinc-500">°</span>
      </span>
    </div>
  );
}
