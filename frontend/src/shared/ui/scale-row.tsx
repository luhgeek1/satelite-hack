'use client';

import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { cn, formatDegrees } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';

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
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const cancelEdit = useRef(false);

  const commitDraft = () => {
    if (!cancelEdit.current && draft !== null) {
      const text = draft.trim().replace(',', '.');
      const parsed = Number(text);

      if (/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) && Number.isFinite(parsed)) {
        const snapped = Number((Math.round(parsed / step) * step).toFixed(10));
        const next = Math.min(max, Math.max(0, snapped));
        if (next !== value) {
          onChange(next);
          onCommit?.(next);
        }
      }
    }

    cancelEdit.current = false;
    setDraft(null);
  };

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

      <label
        className={cn(
          'relative flex h-6 w-[4.75rem] flex-shrink-0 items-center border border-rule-strong bg-white/[0.03] text-zinc-500 transition-colors',
          !disabled && 'cursor-text hover:border-zinc-500 hover:bg-white/[0.06] focus-within:border-zinc-300 focus-within:bg-white/[0.08] focus-within:text-zinc-200',
        )}
        title={t('config.editScale', { label, max, step })}
      >
        <Pencil size={10} className="pointer-events-none absolute left-1.5" aria-hidden="true" />
        <input
          id={`${id}-value`}
          type="text"
          inputMode="decimal"
          aria-label={`${label} value in degrees`}
          autoComplete="off"
          spellCheck={false}
          value={draft ?? formatDegrees(value)}
          disabled={disabled}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault();
              cancelEdit.current = event.key === 'Escape';
              event.currentTarget.blur();
            }
          }}
          className="h-full w-full min-w-0 bg-transparent pl-5 pr-3 text-right font-data text-[11px] tabular-nums text-zinc-200 outline-none disabled:cursor-not-allowed"
        />
        <span className="pointer-events-none absolute right-1 font-data text-[11px]" aria-hidden="true">°</span>
      </label>
    </div>
  );
}
