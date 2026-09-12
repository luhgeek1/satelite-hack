'use client';

import { ChevronRight } from 'lucide-react';
import { useSession } from '@/entities/session';
import { launchStages, planesAtStage, satellitesAtStage } from '@/entities/scenario';
import { useStageRuns, type RunInput } from '@/entities/simulation';
import { cn, formatPercent } from '@/shared/lib';
import { FeatureHint } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument, SimulationSummary } from '@/shared/api';

const HINT_KEY = 'orbitguard-deployment-hint-v1';

/** Three months between launches, which is what turns a stage into a date. */
const MONTHS_BETWEEN_LAUNCHES = 3;

interface DeploymentControlProps {
  scenario: ScenarioDocument;
  runInput: RunInput;
  colors: Record<string, string>;
  planning: boolean;
  onPlanFrom: (stage: number) => void;
  onOpenPlan: () => void;
  /** The first launch whose rings are still free to be designed. */
  nextFreeStage: number;
}

/**
 * The campaign, not a filter.
 *
 * A ring keeps the angles it launched with, so switching launch does not change
 * the design — it changes which rings have arrived. Showing one launch at a
 * time invited the opposite reading, that each stage carries its own settings,
 * which is both wrong and the thing that made this panel hard to follow. All
 * three launches are therefore on screen at once, with what each one actually
 * delivers, and the row is the switch.
 */
export function DeploymentControl({
  scenario,
  runInput,
  colors,
  planning,
  onPlanFrom,
  onOpenPlan,
  nextFreeStage,
}: DeploymentControlProps) {
  const { state, dispatch } = useSession();
  const { t, formatDuration } = useI18n();

  const stages = launchStages(scenario);
  const current = state.config.launch_stage ?? scenario.design.launch_stage;
  const runs = useStageRuns(runInput);

  return (
    <>
      <FeatureHint
        storageKey={HINT_KEY}
        title={t('deploy.tipTitle')}
        text={t('deploy.tipText')}
        side="bottom"
      >
        <p className="mb-2 font-label text-[11px] leading-relaxed text-zinc-500">
          {t('deploy.intro')}
        </p>
      </FeatureHint>

      <div className="border border-rule-strong">
        <div className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-2 border-b border-rule px-2 py-1 font-data text-[9px] tracking-[0.08em] text-zinc-600">
          <span>{t('deploy.colStage')}</span>
          <span>{t('deploy.colRings')}</span>
          <span className="text-right">{t('deploy.colWorst')}</span>
          <span className="w-14 text-right">{t('deploy.colOutage')}</span>
        </div>

        {stages.map(({ stage }) => (
          <StageRow
            key={stage}
            scenario={scenario}
            stage={stage}
            colors={colors}
            current={current === stage}
            summary={runs[stage - 1]?.data}
            onSelect={() => dispatch({ type: 'setLaunchStage', stage })}
            formatDuration={formatDuration}
          />
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onPlanFrom(nextFreeStage)}
          disabled={planning}
          className="flex-1 border border-zinc-600 py-1.5 font-label text-[11px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300 focus-visible:outline-none disabled:opacity-40"
        >
          {t('deploy.planFromStage', { stage: nextFreeStage })}
        </button>
        <button
          type="button"
          onClick={onOpenPlan}
          className="flex items-center gap-1 border border-rule-strong px-2 py-1.5 font-label text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:border-zinc-400 focus-visible:outline-none"
        >
          {t('deploy.open')}
          <ChevronRight size={11} />
        </button>
      </div>
    </>
  );
}

interface StageRowProps {
  scenario: ScenarioDocument;
  stage: number;
  colors: Record<string, string>;
  current: boolean;
  summary: SimulationSummary | undefined;
  onSelect: () => void;
  formatDuration: (seconds: number) => string;
}

function StageRow({
  scenario,
  stage,
  colors,
  current,
  summary,
  onSelect,
  formatDuration,
}: StageRowProps) {
  const { t } = useI18n();

  const rings = planesAtStage(scenario, stage);
  const satellites = satellitesAtStage(scenario, stage);
  const outage = summary
    ? summary.clients.reduce((longest, client) => Math.max(longest, client.max_outage_s), 0)
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={current}
      title={t('deploy.show', { stage })}
      className={cn(
        'grid w-full grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-2 border-b border-rule px-2 py-1.5 text-left transition-colors last:border-b-0 focus-visible:bg-white/[0.08] focus-visible:outline-none',
        current ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]',
      )}
    >
      <span
        className={cn(
          'font-data text-[11px] tabular-nums',
          current ? 'text-zinc-100' : 'text-zinc-500',
        )}
      >
        {stage}
      </span>

      <span className="flex min-w-0 items-baseline gap-1">
        {rings.map((ring) => (
          <span
            key={ring}
            className="font-data text-[10px]"
            style={{ color: colors[ring] ?? '#71717a' }}
          >
            {ring}
          </span>
        ))}
        <span className="ml-1 truncate font-data text-[9px] tabular-nums text-zinc-600">
          {t('deploy.sv', { count: satellites })} ·{' '}
          {t('deploy.month', { month: (stage - 1) * MONTHS_BETWEEN_LAUNCHES })}
        </span>
      </span>

      <span
        className={cn(
          'text-right font-data text-[11px] tabular-nums',
          summary === undefined
            ? 'text-zinc-700'
            : summary.meets_target
              ? 'text-zinc-100'
              : 'text-alarm',
        )}
      >
        {summary === undefined ? '—' : formatPercent(summary.worst_availability)}
      </span>

      <span className="w-14 text-right font-data text-[10px] tabular-nums text-zinc-500">
        {outage === null ? '—' : formatDuration(outage)}
      </span>
    </button>
  );
}
