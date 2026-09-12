'use client';

import { useState } from 'react';
import { cn, formatPercent } from '@/shared/lib';
import { ErrorNote, IndeterminateBar } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { RunInput } from '@/entities/simulation';
import { SWEEPS, useSensitivitySweep, type SweepSpec } from '../model/use-sensitivity';

export function SensitivityPanel({ runInput }: { runInput: RunInput }) {
  const { t } = useI18n();
  const sweep = useSensitivitySweep(runInput);
  const [spec, setSpec] = useState<SweepSpec>(SWEEPS[0]);

  const points = sweep.data?.points ?? [];
  const threshold = sweep.data?.threshold ?? null;

  return (
    <div className="border-b border-rule px-3 py-3">
      <div className="font-label text-[12px] text-zinc-300">{t('sensitivity.title')}</div>

      <div className="mt-2 flex border border-rule-strong">
        {SWEEPS.map((option) => (
          <button
            key={option.parameter}
            type="button"
            onClick={() => setSpec(option)}
            aria-pressed={spec.parameter === option.parameter}
            className={cn(
              'flex-1 border-l border-rule-strong py-1 font-data text-[9px] tracking-[0.06em] transition-colors first:border-l-0 focus-visible:outline-none',
              spec.parameter === option.parameter
                ? 'bg-white/[0.12] text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-200',
            )}
          >
            {t(option.tokenKey)}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => sweep.mutate(spec)}
        disabled={sweep.isPending}
        className="mt-2 w-full border border-rule-strong py-1.5 font-label text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none disabled:opacity-50"
      >
        {sweep.isPending
          ? t('sensitivity.sweeping')
          : t('sensitivity.sweep', { parameter: t(spec.labelKey) })}
      </button>

      {sweep.isPending && (
        <div className="mt-2">
          <IndeterminateBar />
        </div>
      )}

      {sweep.isError && (
        <div className="mt-2">
          <ErrorNote error={sweep.error} />
        </div>
      )}

      {points.length > 0 && (
        <>
          <div className="mt-3 space-y-px">
            {points.map((point) => (
              <div
                key={point.value}
                className={cn(
                  'flex items-center gap-2 font-data text-[10px] tabular-nums',
                  point.value === threshold && 'text-zinc-100',
                )}
              >
                <span className="w-11 text-right text-zinc-500">
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
                  <span className="absolute inset-y-0 w-px bg-alarm/60" style={{ left: '90%' }} />
                </span>
                <span
                  className={cn('w-11 text-right', point.meets_target ? 'text-zinc-200' : 'text-zinc-500')}
                >
                  {formatPercent(point.worst_availability, 1)}
                </span>
              </div>
            ))}
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
