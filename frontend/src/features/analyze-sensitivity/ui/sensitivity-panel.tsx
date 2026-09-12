'use client';

import { useState } from 'react';
import { cn, formatPercent } from '@/shared/lib';
import { ErrorNote, IndeterminateBar } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { RunInput } from '@/entities/simulation';
import { SWEEPS, useSensitivitySweeps, type SweepParameter } from '../model/use-sensitivity';

interface SensitivityPanelProps {
  runInput: RunInput;
  /** The scenario's own value per parameter, marked on its row. */
  currentValues?: Partial<Record<SweepParameter, number>>;
  /** Target availability, drawn as the line every bar is read against. */
  target?: number;
}

/**
 * How far the hardware can be pushed before the target is lost.
 *
 * The three sweeps run as soon as the tab has a configuration, so a tab is a
 * view onto an answer that already exists rather than a button to press.
 */
export function SensitivityPanel({ runInput, currentValues, target = 0.9 }: SensitivityPanelProps) {
  const { t } = useI18n();
  const sweeps = useSensitivitySweeps(runInput, true);
  const [index, setIndex] = useState(0);

  const spec = SWEEPS[index];
  const sweep = sweeps[index];
  const points = sweep?.data?.points ?? [];
  const threshold = sweep?.data?.threshold ?? null;
  const current = currentValues?.[spec.parameter];

  return (
    <div className="border-b border-rule px-3 py-3" data-tour="sensitivity">
      <div className="font-label text-[12px] text-zinc-300">{t('sensitivity.title')}</div>
      <p className="mt-1 font-label text-[11px] leading-relaxed text-zinc-500">
        {t('sensitivity.intro')}
      </p>

      <div className="mt-2 flex border border-rule-strong">
        {SWEEPS.map((option, position) => (
          <button
            key={option.parameter}
            type="button"
            onClick={() => setIndex(position)}
            aria-pressed={index === position}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 border-l border-rule-strong py-1 font-data text-[9px] tracking-[0.06em] transition-colors first:border-l-0 focus-visible:outline-none',
              index === position
                ? 'bg-white/[0.12] text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-200',
            )}
          >
            {t(option.tokenKey)}
            {sweeps[position]?.isFetching && (
              <span className="h-1 w-1 animate-pulse rounded-full bg-zinc-400" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>

      {sweep?.isPending && (
        <div className="mt-3">
          <div className="font-data text-[10px] text-zinc-600">
            {t('sensitivity.sweeping', { parameter: t(spec.labelKey) })}
          </div>
          <div className="mt-1.5">
            <IndeterminateBar />
          </div>
        </div>
      )}

      {sweep?.isError && (
        <div className="mt-2">
          <ErrorNote error={sweep.error} />
        </div>
      )}

      {points.length > 0 && (
        <>
          <div className="mt-3 space-y-px">
            {points.map((point) => {
              const isCurrent = current !== undefined && Math.abs(point.value - current) < 1e-9;
              return (
                <div
                  key={point.value}
                  className={cn(
                    'flex items-center gap-2 font-data text-[10px] tabular-nums',
                    isCurrent && 'bg-white/[0.04]',
                  )}
                >
                  <span
                    className={cn(
                      'w-12 text-right',
                      isCurrent ? 'text-zinc-100' : point.value === threshold ? 'text-zinc-300' : 'text-zinc-500',
                    )}
                  >
                    {point.value}
                    <span className="text-zinc-700">{spec.unit}</span>
                  </span>
                  <span className="relative h-2 flex-1 bg-white/[0.04]">
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0',
                        point.meets_target ? 'bg-zinc-300' : 'bg-zinc-600',
                      )}
                      style={{ width: `${point.worst_availability * 100}%` }}
                    />
                    <span
                      className="absolute inset-y-0 w-px bg-alarm/60"
                      style={{ left: `${target * 100}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      'w-11 text-right',
                      point.meets_target ? 'text-zinc-200' : 'text-zinc-500',
                    )}
                  >
                    {formatPercent(point.worst_availability, 1)}
                  </span>
                  <span className="w-8 font-label text-[9px] text-zinc-500">
                    {isCurrent ? t('sensitivity.now') : ''}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-2 font-label text-[11px] leading-relaxed text-zinc-500">
            {threshold === null
              ? t('sensitivity.none', {
                  parameter: t(spec.labelKey),
                  rationale: t(spec.rationaleKey),
                })
              : t('sensitivity.threshold', {
                  value: threshold,
                  unit: spec.unit,
                  rationale: t(spec.rationaleKey),
                })}
          </p>
        </>
      )}
    </div>
  );
}
