'use client';

import { ArrowRight, ChevronRight, Lock, LockOpen, Sparkles } from 'lucide-react';
import { useSession } from '@/entities/session';
import { launchStages, planesAtStage, satellitesAtStage } from '@/entities/scenario';
import { useStageRuns, type RunInput } from '@/entities/simulation';
import { cn, formatDegrees, formatPercent, formatWait } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ReactNode } from 'react';
import type { ScenarioDocument, SimulationSummary } from '@/shared/api';

/** Three months between launches, which is what turns a stage into a date. */
const MONTHS_BETWEEN_LAUNCHES = 3;

/** Named here rather than imported: the search belongs to another feature, and
 *  this one only needs to offer the choice and quote its price. */
export type SearchDepth = 'quick' | 'standard';

export interface FindCost {
  runs: number;
  seconds: number;
}

interface DeploymentControlProps {
  scenario: ScenarioDocument;
  runInput: RunInput;
  colors: Record<string, string>;
  planning: boolean;
  onPlanFrom: (stage: number) => void;
  onOpenPlan: () => void;
  depth: SearchDepth;
  onDepthChange: (depth: SearchDepth) => void;
  /** What a search from the launch on screen costs at each depth. */
  findCosts: Record<SearchDepth, FindCost>;
  /** Whatever offers the longer explanation — handed in, so this feature does
   *  not have to know that a guided tour exists. */
  guide?: ReactNode;
}

/**
 * The campaign, and the one step being taken in it.
 *
 * A ring keeps the angles it launched with, so switching launch does not change
 * the design — it changes which rings have arrived. Showing one launch at a
 * time invited the opposite reading, that each stage carries its own settings,
 * which is both wrong and the thing that made this panel hard to follow. All
 * three launches are therefore on screen at once, with what each one actually
 * delivers, and the row is the switch.
 *
 * Under them is the step: what the selected launch is — a draft or a decision —
 * what that means, and the one or two things worth doing about it. A campaign
 * planned by settling one launch at a time needs somewhere to say which launch
 * is being settled, and this is it.
 */
export function DeploymentControl({
  scenario,
  runInput,
  colors,
  planning,
  onPlanFrom,
  onOpenPlan,
  depth,
  onDepthChange,
  findCosts,
  guide,
}: DeploymentControlProps) {
  const { state, dispatch } = useSession();
  const { t, formatDuration } = useI18n();

  const stages = launchStages(scenario);
  const current = state.config.launch_stage ?? scenario.design.launch_stage;
  const runs = useStageRuns(runInput);
  const committed = state.committedStages;

  return (
    <>
      <div className="mb-2 flex items-start gap-2">
        <p className="font-label text-[11px] leading-relaxed text-zinc-500">{t('deploy.intro')}</p>
        {guide}
      </div>

      <div className="border border-rule-strong" data-tour="deploy-table">
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
            fixed={committed.includes(stage)}
            summary={runs[stage - 1]?.data}
            onSelect={() => dispatch({ type: 'setLaunchStage', stage })}
            formatDuration={formatDuration}
          />
        ))}
      </div>

      <StepCard
        scenario={scenario}
        stage={current}
        lastStage={stages[stages.length - 1]?.stage ?? 3}
        fixed={committed.includes(current)}
        allFixed={stages.every(({ stage }) => committed.includes(stage))}
        planning={planning}
        colors={colors}
        depth={depth}
        onDepthChange={onDepthChange}
        findCosts={findCosts}
        onPlan={() => onPlanFrom(current)}
        onFix={() => dispatch({ type: 'commitStage', stage: current })}
        onRelease={() => dispatch({ type: 'releaseStage', stage: current })}
        onGo={(stage) => dispatch({ type: 'setLaunchStage', stage: stage as 1 | 2 | 3 })}
      />

      <button
        type="button"
        onClick={onOpenPlan}
        data-tour="deploy-open"
        className="mt-2 flex w-full items-center justify-center gap-1 border border-rule px-2 py-1.5 font-label text-[11px] text-zinc-500 transition-colors hover:border-rule-strong hover:text-zinc-200 focus-visible:border-zinc-400 focus-visible:outline-none"
      >
        {t('deploy.open')}
        <ChevronRight size={11} />
      </button>
    </>
  );
}

interface StageRowProps {
  scenario: ScenarioDocument;
  stage: number;
  colors: Record<string, string>;
  current: boolean;
  fixed: boolean;
  summary: SimulationSummary | undefined;
  onSelect: () => void;
  formatDuration: (seconds: number) => string;
}

function StageRow({
  scenario,
  stage,
  colors,
  current,
  fixed,
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
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            'font-data text-[11px] tabular-nums',
            current ? 'text-zinc-100' : 'text-zinc-500',
          )}
        >
          {stage}
        </span>
        {fixed && <Lock size={8} className="text-zinc-400" aria-hidden="true" />}
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

interface StepCardProps {
  scenario: ScenarioDocument;
  stage: number;
  lastStage: number;
  fixed: boolean;
  allFixed: boolean;
  planning: boolean;
  colors: Record<string, string>;
  depth: SearchDepth;
  onDepthChange: (depth: SearchDepth) => void;
  findCosts: Record<SearchDepth, FindCost>;
  onPlan: () => void;
  onFix: () => void;
  onRelease: () => void;
  onGo: (stage: number) => void;
}

/**
 * The selected launch, said in words, with what can be done to it.
 *
 * Two buttons at most. A draft launch is a question — what angles — and the
 * two answers are the search and your own hand, both ending in the same place:
 * fixing it. A fixed launch is an answer, so what is offered instead is the
 * next launch and, quietly, the way back.
 */
function StepCard({
  scenario,
  stage,
  lastStage,
  fixed,
  allFixed,
  planning,
  colors,
  depth,
  onDepthChange,
  findCosts,
  onPlan,
  onFix,
  onRelease,
  onGo,
}: StepCardProps) {
  const { state } = useSession();
  const { t } = useI18n();

  const next = Math.min(stage + 1, lastStage);
  const hasNext = stage < lastStage;
  const rings = planesAtStage(scenario, stage).filter((ring) =>
    scenario.design.satellites.some(
      (satellite) => satellite.plane_id === ring && satellite.launch_batch === stage,
    ),
  );

  return (
    <div className="mt-2 border border-rule-strong bg-white/[0.02] px-2 py-2" data-tour="deploy-step">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'border px-1 py-px font-data text-[8px] tracking-[0.08em]',
            fixed ? 'border-zinc-500 text-zinc-200' : 'border-rule text-zinc-500',
          )}
        >
          {t(fixed ? 'deploy.badgeFixed' : 'deploy.badgeDraft')}
        </span>
        <span className="font-label text-[11px] text-zinc-300">
          {t(fixed ? 'deploy.stateFixed' : 'deploy.stateDraft', { stage })}
        </span>
      </div>

      {fixed && rings.length > 0 && (
        <div className="mt-1.5 space-y-px">
          {rings.map((ring) => {
            const plane = scenario.design.planes.find((item) => item.id === ring);
            const override = state.config.planes?.[ring];
            return (
              <div key={ring} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-0.5 flex-shrink-0"
                  style={{ background: colors[ring] ?? '#52525b' }}
                />
                <span className="font-data text-[10px] tabular-nums text-zinc-400">
                  {t('deploy.fixedRing', {
                    ring,
                    raan: formatDegrees(override?.raan_deg ?? plane?.raan_deg ?? 0),
                    phase: formatDegrees(override?.phase_deg ?? plane?.phase_deg ?? 0),
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-1.5 font-label text-[11px] leading-relaxed text-zinc-500">
        {fixed
          ? allFixed
            ? t('deploy.fixedHintAll')
            : t('deploy.fixedHint', { next })
          : hasNext
            ? t('deploy.draftHint', { next })
            : t('deploy.draftHintLast')}
      </p>

      <div className="mt-2 flex gap-2">
        {fixed ? (
          <>
            {hasNext && (
              <button
                type="button"
                onClick={() => onGo(next)}
                className="flex flex-1 items-center justify-center gap-1.5 border border-zinc-600 py-1.5 font-label text-[11px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300 focus-visible:outline-none"
              >
                {t('deploy.goNext', { stage: next })}
                <ArrowRight size={11} />
              </button>
            )}
            <button
              type="button"
              onClick={onRelease}
              title={t('deploy.releaseHint')}
              className={cn(
                'flex items-center justify-center gap-1.5 border border-rule-strong px-2 py-1.5 font-label text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none',
                !hasNext && 'flex-1',
              )}
            >
              <LockOpen size={11} />
              {t('deploy.release')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onPlan}
              disabled={planning}
              title={t('deploy.findHint')}
              data-tour="deploy-find"
              // The one filled button in the panel: the search is the thing this
              // studio does that a spreadsheet cannot, and it should read so.
              className="flex flex-1 items-center justify-center gap-1.5 border border-zinc-100 bg-zinc-100 py-1.5 font-label text-[11px] font-semibold text-black transition-colors hover:bg-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-zinc-300 disabled:opacity-40"
            >
              <Sparkles size={11} />
              {t(planning ? 'deploy.finding' : 'deploy.find')}
            </button>
            <button
              type="button"
              onClick={onFix}
              title={t('deploy.fixHint')}
              data-tour="deploy-fix"
              className="flex items-center justify-center gap-1.5 border border-rule-strong px-2 py-1.5 font-label text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none"
            >
              <Lock size={11} />
              {t('deploy.fix')}
            </button>
          </>
        )}
      </div>

      {!fixed && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex border border-rule" role="group" aria-label={t('deploy.depthLabel')}>
            {(['quick', 'standard'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onDepthChange(option)}
                disabled={planning}
                aria-pressed={depth === option}
                title={t(option === 'quick' ? 'deploy.depthQuickHint' : 'deploy.depthStandardHint')}
                className={cn(
                  'border-l border-rule px-1.5 py-0.5 font-label text-[10px] transition-colors first:border-l-0 focus-visible:outline-none disabled:opacity-50',
                  depth === option ? 'bg-white/[0.1] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200',
                )}
              >
                {t(option === 'quick' ? 'deploy.depthQuick' : 'deploy.depthStandard')}
              </button>
            ))}
          </div>
          <span className="truncate font-data text-[9px] tabular-nums text-zinc-600">
            {t('deploy.findCost', {
              runs: findCosts[depth].runs,
              wait: formatWait(findCosts[depth].seconds),
            })}
          </span>
        </div>
      )}
    </div>
  );
}
