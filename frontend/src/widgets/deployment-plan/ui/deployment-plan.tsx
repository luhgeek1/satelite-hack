'use client';

import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, Lock, LockOpen, Sparkles, X } from 'lucide-react';
import { useSession } from '@/entities/session';
import {
  firstOpenStage,
  launchStages,
  planeCommitStage,
  planesAtStage,
  raanSpread,
  satellitesAtStage,
} from '@/entities/scenario';
import { useStageRuns, type RunInput } from '@/entities/simulation';
import { cn, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument, SimulationSummary } from '@/shared/api';
import { StageStrip } from './stage-strip';
import { RaanDial } from './raan-dial';

interface DeploymentPlanProps {
  scenario: ScenarioDocument;
  runInput: RunInput;
  colors: Record<string, string>;
  planning: boolean;
  onPlanFrom: (stage: number) => void;
  onClose: () => void;
}












export function DeploymentPlan({
  scenario,
  runInput,
  colors,
  planning,
  onPlanFrom,
  onClose,
}: DeploymentPlanProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();
  const reduce = useReducedMotion();

  const runs = useStageRuns(runInput);
  const stages = launchStages(scenario);
  const current = state.config.launch_stage ?? scenario.design.launch_stage;
  const spread = raanSpread(scenario, state.config);
  const lastStage = stages[stages.length - 1]?.stage ?? 3;
  const committed = state.committedStages;
  const open = firstOpenStage(scenario, committed);

  return (
    <motion.div
      key="deployment-plan"
      initial={reduce ? false : { opacity: 0, clipPath: 'inset(0 0 0 100%)' }}
      animate={{ opacity: 1, clipPath: 'inset(0 0 0 0%)' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, clipPath: 'inset(0 0 0 100%)' }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="absolute right-full top-2 z-20 mr-2 flex max-h-[calc(100%-1rem)] w-[26rem] max-w-[calc(100vw-3rem)] flex-col overflow-y-auto overscroll-contain border border-rule-strong bg-[#09090b] shadow-2xl"
    >
      <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <div className="font-label text-[13px] text-zinc-100">{t('deploy.title')}</div>
          <p className="mt-1 font-label text-[11px] leading-relaxed text-zinc-500">
            {committed.length
              ? t('deploy.planProgress', { fixed: committed.length, total: stages.length })
              : t('deploy.planStart', { stage: open })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('deploy.close')}
          className="flex-shrink-0 text-zinc-600 transition-colors hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:outline-none"
        >
          <X size={15} />
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-3 gap-y-1 font-data text-[9px] tracking-[0.08em] text-zinc-600">
          <span>{t('deploy.colStage')}</span>
          <span>{t('deploy.colRings')}</span>
          <span className="text-right">{t('deploy.colWorst')}</span>
          <span className="text-right">{t('deploy.colOutage')}</span>
        </div>

        <div className="mt-1 space-y-2">
          {stages.map(({ stage }) => (
            <StageBlock
              key={stage}
              scenario={scenario}
              stage={stage}
              lastStage={lastStage}
              summary={runs[stage - 1]?.data}
              loading={runs[stage - 1]?.isPending ?? false}
              colors={colors}
              current={current === stage}
              fixed={committed.includes(stage)}
              planning={planning}
              onShow={() => dispatch({ type: 'setLaunchStage', stage })}
              onPlan={() => onPlanFrom(stage)}
              onFix={() => dispatch({ type: 'commitStage', stage })}
              onRelease={() => dispatch({ type: 'releaseStage', stage })}
            />
          ))}
        </div>
      </div>

      {spread && (
        <div className="border-t border-rule px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-label text-[12px] text-zinc-300">{t('deploy.spread')}</span>
            <span
              className={cn(
                'ml-auto flex items-center gap-1 font-data text-[10px] tracking-[0.06em]',
                spread.even ? 'text-zinc-300' : 'text-alarm',
              )}
            >
              {spread.even ? <Check size={11} /> : <X size={11} />}
              {t(spread.even ? 'deploy.spreadEven' : 'deploy.spreadUneven')}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-4">
            <RaanDial scenario={scenario} config={state.config} colors={colors} />
            <div className="min-w-0 flex-1">
              <div className="font-data text-[11px] tabular-nums text-zinc-200">
                {spread.gaps.map((gap) => `${gap.toFixed(0)}°`).join(' · ')}
              </div>
              <p className="mt-1 font-label text-[11px] leading-relaxed text-zinc-500">
                {t(spread.even ? 'deploy.spreadEvenNote' : 'deploy.spreadUnevenNote', {
                  ideal: spread.idealGap.toFixed(0),
                })}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface StageBlockProps {
  scenario: ScenarioDocument;
  stage: number;
  lastStage: number;
  summary: SimulationSummary | undefined;
  loading: boolean;
  colors: Record<string, string>;
  current: boolean;
  fixed: boolean;
  planning: boolean;
  onShow: () => void;
  onPlan: () => void;
  onFix: () => void;
  onRelease: () => void;
}

function StageBlock({
  scenario,
  stage,
  lastStage,
  summary,
  loading,
  colors,
  current,
  fixed,
  planning,
  onShow,
  onPlan,
  onFix,
  onRelease,
}: StageBlockProps) {
  const { t, formatDuration } = useI18n();

  const rings = planesAtStage(scenario, stage);
  const satellites = satellitesAtStage(scenario, stage);
  const worst = summary?.worst_availability;
  const outage = summary
    ? summary.clients.reduce((longest, client) => Math.max(longest, client.max_outage_s), 0)
    : null;
  const commits = rings.filter((ring) => planeCommitStage(scenario, ring) === stage);

  return (
    <div
      className={cn(
        'border-l-2 py-1.5 pl-2.5 pr-1 transition-colors',
        current ? 'border-zinc-300 bg-white/[0.05]' : 'border-transparent hover:bg-white/[0.02]',
      )}
    >
      <button
        type="button"
        onClick={onShow}
        aria-pressed={current}
        title={t('deploy.show', { stage })}
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-3 text-left focus-visible:outline-none"
      >
        <span className="flex items-baseline gap-1">
          <span className="font-data text-[12px] tabular-nums text-zinc-200">{stage}</span>
          {fixed && <Lock size={9} className="text-zinc-400" aria-hidden="true" />}
        </span>
        <span className="flex min-w-0 items-baseline gap-1.5">
          {rings.map((ring) => (
            <span
              key={ring}
              className="font-data text-[10px]"
              style={{ color: colors[ring] ?? '#71717a' }}
            >
              {ring}
            </span>
          ))}
          <span className="font-data text-[10px] tabular-nums text-zinc-600">
            {t('deploy.sv', { count: satellites })}
          </span>
        </span>
        <span
          className={cn(
            'text-right font-data text-[12px] tabular-nums',
            worst === undefined
              ? 'text-zinc-700'
              : summary?.meets_target
                ? 'text-zinc-100'
                : 'text-alarm',
          )}
        >
          {worst === undefined ? '—' : formatPercent(worst)}
        </span>
        <span className="w-16 text-right font-data text-[11px] tabular-nums text-zinc-500">
          {outage === null ? '—' : formatDuration(outage)}
        </span>
      </button>

      <StageStrip summary={summary} loading={loading} />

      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            'border px-1 py-px font-data text-[8px] tracking-[0.08em]',
            fixed ? 'border-zinc-500 text-zinc-200' : 'border-rule text-zinc-600',
          )}
        >
          {t(fixed ? 'deploy.badgeFixed' : 'deploy.badgeDraft')}
        </span>
        <span className="min-w-0 flex-1 truncate font-label text-[10px] text-zinc-600">
          {commits.length
            ? t('deploy.commits', { rings: commits.join(', ') })
            : t('deploy.commitsNone')}
        </span>
      </div>



      {current && (
        <>
          <p className="mt-1.5 font-label text-[11px] leading-relaxed text-zinc-500">
            {fixed
              ? t('deploy.fixedKept')
              : stage < lastStage
                ? t('deploy.planFromHint', { stage, last: lastStage })
                : t('deploy.draftHintLast')}
          </p>

          <div className="mt-1.5 flex gap-1.5">
            {fixed ? (
              <button
                type="button"
                onClick={onRelease}
                title={t('deploy.releaseHint')}
                className="flex items-center gap-1 border border-rule-strong px-2 py-1 font-label text-[10px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none"
              >
                <LockOpen size={10} />
                {t('deploy.release')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onPlan}
                  disabled={planning}
                  title={t('deploy.findHint')}
                  className="flex items-center gap-1 border border-zinc-600 px-2 py-1 font-label text-[10px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:outline-none disabled:opacity-40"
                >
                  <Sparkles size={10} />
                  {t(planning ? 'deploy.finding' : 'deploy.find')}
                </button>
                <button
                  type="button"
                  onClick={onFix}
                  title={t('deploy.fixHint')}
                  className="flex items-center gap-1 border border-rule-strong px-2 py-1 font-label text-[10px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none"
                >
                  <Lock size={10} />
                  {t('deploy.fix')}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {!current && fixed && (
        <p className="mt-1 flex items-center gap-1 font-label text-[10px] text-zinc-600">
          <ArrowRight size={9} aria-hidden="true" />
          {t('deploy.fixedQuiet')}
        </p>
      )}
    </div>
  );
}
