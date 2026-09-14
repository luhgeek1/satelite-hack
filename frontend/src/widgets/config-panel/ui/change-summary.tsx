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

  current: SimulationSummary | undefined;

  baseline: SimulationSummary | undefined;
}










export function ChangeSummary({ scenario, current, baseline }: ChangeSummaryProps) {
  const { state, dispatch } = useSession();
  const { t, formatDuration } = useI18n();

  const changes = describeConfigChanges(scenario, state.config, state.strategy, t);
  const untouched = changes.length === 0;

  const shown = changes.slice(0, VISIBLE_ROWS);
  const hidden = changes.length - shown.length;

  const worstDelta =
    current && baseline ? current.worst_availability - baseline.worst_availability : null;
  const outageOf = (summary: SimulationSummary) =>
    summary.clients.reduce((longest, client) => Math.max(longest, client.max_outage_s), 0);
  const outageDelta = current && baseline ? outageOf(current) - outageOf(baseline) : null;

  return (
    <div className="flex-shrink-0 border-b border-rule bg-white/[0.02] px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="font-label text-[11px] text-zinc-300">{t('changes.title')}</span>
        <span
          className={cn(
            'font-data text-[10px] tabular-nums',
            untouched ? 'text-zinc-600' : 'text-zinc-500',
          )}
        >
          {changes.length}
        </span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'resetConfig' })}
          disabled={untouched}
          className="ml-auto flex items-center gap-1 font-label text-[10px] text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline focus-visible:outline-none disabled:pointer-events-none disabled:text-zinc-700 disabled:no-underline"
        >
          <RotateCcw size={10} />
          {t('changes.reset')}
        </button>
      </div>




      <div className="mt-1.5 space-y-0.5">


        {untouched && (
          <div className="font-label text-[10px] text-zinc-600">{t('changes.none')}</div>
        )}

        {shown.map((change) => (
          <SummaryRow key={change.id} label={change.label} from={change.from} to={change.to} />
        ))}

        {hidden > 0 && (
          <div className="font-data text-[10px] text-zinc-600">
            {t('changes.more', { count: hidden })}
          </div>
        )}

        {worstDelta !== null && outageDelta !== null && (
          <>
            <SummaryRow
              label={t('changes.worstAvailability')}
              from={formatPercent(baseline!.worst_availability)}
              to={formatPercent(current!.worst_availability)}
              delta={worstDelta === 0 ? null : formatPoints(worstDelta)}
              better={worstDelta > 0}
            />
            <SummaryRow
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
          </>
        )}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  from,
  to,
  delta = null,
  better = false,
}: {
  label: string;
  from: string;
  to: string;
  delta?: string | null;
  better?: boolean;
}) {

  const moved = from !== to;

  return (
    <div className="flex items-baseline gap-2 font-data text-[10px] tabular-nums">
      <span className="truncate text-zinc-400">{label}</span>
      {moved && (
        <>
          <span className="ml-auto shrink-0 text-zinc-600">{from}</span>
          <span className="shrink-0 text-zinc-700">&rarr;</span>
        </>
      )}
      <span className={cn('shrink-0 text-zinc-100', !moved && 'ml-auto')}>{to}</span>

      <span className={cn('w-14 shrink-0 text-right', better ? 'text-zinc-200' : 'text-alarm')}>
        {delta}
      </span>
    </div>
  );
}
