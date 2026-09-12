'use client';

import { useRef, useState } from 'react';
import { cn, formatDegrees } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';

/**
 * The grid the scale and its caption share. Stated once so a caption stop and
 * the cursor it names cannot drift apart.
 */
export const SCALE_GRID = 'grid grid-cols-[2.9rem_minmax(0,1fr)_3.4rem] items-center gap-x-2';

/** The slider thumb is 11px wide, so its travel is inset by half of it. */
const TRAVEL_INSET = 5;

interface ScaleCaptionProps {
  label: string;
  /** The values an operator names — a third of a turn, a quarter, the end. */
  stops: number[];
  max: number;
}

/**
 * One ruler for the tracks below it. A scale that states where it starts, what
 * it counts in and where it ends needs no sentence underneath explaining the
 * same thing in prose.
 */
export function ScaleCaption({ label, stops, max }: ScaleCaptionProps) {
  return (
    <>
      <span className="font-data text-[10px] tracking-[0.06em] text-zinc-500">{label}</span>
      <div className="relative h-3.5" aria-hidden="true">
        {stops.map((stop, index) => {
          const last = index === stops.length - 1;
          return (
            <span
              key={stop}
              className="absolute top-0 whitespace-nowrap font-data text-[9px] tabular-nums text-zinc-600"
              style={{
                left: `calc(${TRAVEL_INSET}px + ${stop / max} * (100% - ${TRAVEL_INSET * 2}px))`,
                transform: index === 0 ? 'none' : last ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {stop}
              {last && <span className="text-zinc-700">&deg;</span>}
            </span>
          );
        })}
      </div>
      <span />
    </>
  );
}

interface ScaleRowProps {
  id: string;
  label: string;
  /** Identity colour of whatever the row measures, drawn as a spine. */
  accent?: string;
  value: number;
  max: number;
  step: number;
  ticks: number;
  majorEvery: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

/**
 * A slide rule on one line: who is being set, the travel, and the reading.
 *
 * The reading is a readout rather than a form field — a bordered box with a
 * pencil in it shouted louder than the control it belongs to, six times over.
 * It still takes typing; the rule under it appears when the pointer is on it.
 */
export function ScaleRow({
  id,
  label,
  accent,
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
    <>
      <label
        htmlFor={id}
        className={cn('flex items-center gap-1.5', disabled && 'opacity-50', !disabled && 'cursor-ew-resize')}
      >
        {accent && <span className="h-2.5 w-0.5 flex-shrink-0" style={{ background: accent }} />}
        <span className="font-data text-[11px] text-zinc-300">{label}</span>
      </label>

      <div className={cn('relative h-[15px] min-w-0', disabled && 'opacity-50')}>
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
          'group relative flex items-baseline justify-end',
          disabled ? 'opacity-50' : 'cursor-text',
        )}
        title={t('config.editScale', { label, max, step })}
      >
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
          className="min-w-0 flex-1 bg-transparent text-right font-data text-[11px] tabular-nums text-zinc-200 outline-none transition-colors group-hover:text-white focus:text-white disabled:cursor-not-allowed"
        />
        <span className="flex-shrink-0 font-data text-[11px] text-zinc-600">&deg;</span>
        <span className="pointer-events-none absolute -bottom-0.5 left-0 right-0 h-px bg-transparent transition-colors group-hover:bg-rule-strong group-focus-within:bg-zinc-400" />
      </label>
    </>
  );
}
