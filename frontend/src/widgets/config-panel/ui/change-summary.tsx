'use client';

import { RotateCcw } from 'lucide-react';
import { useSession } from '@/entities/session';
import { describeConfigChanges } from '@/entities/simulation';
import { cn, formatPercent, formatPoints } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument, SimulationSummary } from '@/shared/api';

const VISIBLE_ROWS = 4;

interface ChangeSummaryProps {
  scenario: ScenarioDocument;
  /** The run as configured right now. */
  current: SimulationSummary | undefined;
  /** The same scenario with nothing changed — the reference every delta is against. */
  baseline: SimulationSummary | undefined;
}

/**
 * What has been changed since the file was loaded, and what it bought.
 *
 * Without this the header keeps showing the scenario's name after an optimizer
 * pass or half an hour of sliders, and nothing on screen says the numbers no
 * longer describe the file. The reference is deliberately the file rather than
 * the previous run: "what have I changed" is the question, and its answer must
 * survive a reload.
 */
export function ChangeSummary({ scenario, current, baseline }: ChangeSummaryProps) {
  const { state, dispatch } = useSession();
  const { t, formatDuration } = useI18n();

  const changes = describeConfigChanges(scenario, state.config, state.strategy, t);
  if (changes.length === 0) return null;

  const shown = changes.slice(0, VISIBLE_ROWS);
  const hidden = changes.length - shown.length;

  const worstDelta =
    current && baseline ? current.worst_availability - baseline.worst_availability : null;
  const outageOf = (summary: SimulationSummary) =>
    summary.clients.reduce((longest, client) => Math.max(longest, client.max_outage_s), 0);
  const outageDelta = current && baseline ? outageOf(current) - outageOf(baseline) : null;

  return (
    <div className="flex-shrink-0 border-b border-rule bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-label text-[11px] text-zinc-300">{t('changes.title')}</span>
        <span className="font-data text-[10px] tabular-nums text-zinc-500">{changes.length}</span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'resetConfig' })}
          className="ml-auto flex items-center gap-1 font-label text-[10px] text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline focus-visible:outline-none"
        >
          <RotateCcw size={10} />
          {t('changes.reset')}
        </button>
      </div>

      <div className="mt-1.5 space-y-0.5">
        {shown.map((change) => (
          <div
            key={change.id}
            className="flex items-baseline gap-2 font-data text-[10px] tabular-nums"
          >
            <span className="truncate text-zinc-400">{change.label}</span>
            <span className="ml-auto shrink-0 text-zinc-600">{change.from}</span>
            <span className="shrink-0 text-zinc-700">&rarr;</span>
            <span className="shrink-0 text-zinc-100">{change.to}</span>
          </div>
        ))}
        {hidden > 0 && (
          <div className="font-data text-[10px] text-zinc-600">
            {t('changes.more', { count: hidden })}
          </div>
        )}
      </div>

      {worstDelta !== null && outageDelta !== null && (
        <div className="mt-2 border-t border-rule pt-1.5">
          <div className="font-label text-[10px] text-zinc-500">{t('changes.vsFile')}</div>
          <div className="mt-1 space-y-0.5">
            <DeltaRow
              label={t('changes.worstAvailability')}
              from={formatPercent(baseline!.worst_availability)}
              to={formatPercent(current!.worst_availability)}
              delta={worstDelta === 0 ? null : formatPoints(worstDelta)}
              better={worstDelta > 0}
            />
            <DeltaRow
              label={t('changes.longestOutage')}
              from={formatDuration(outageOf(baseline!))}
              to={formatDuration(outageOf(current!))}
              delta={
                outageDelta === 0
                  ? null
                  : `${outageDelta > 0 ? '+' : '−'}${formatDuration(Math.abs(outageDelta))}`
              }
              better={outageDelta < 0}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DeltaRow({
  label,
  from,
  to,
  delta,
  better,
}: {
  label: string;
  from: string;
  to: string;
  delta: string | null;
  better: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 font-data text-[10px] tabular-nums">
      <span className="truncate text-zinc-400">{label}</span>
      <span className="ml-auto shrink-0 text-zinc-600">{from}</span>
      <span className="shrink-0 text-zinc-700">&rarr;</span>
      <span className="shrink-0 text-zinc-100">{to}</span>
      {delta && (
        <span className={cn('w-14 shrink-0 text-right', better ? 'text-zinc-200' : 'text-alarm')}>
          {delta}
        </span>
      )}
    </div>
  );
}
