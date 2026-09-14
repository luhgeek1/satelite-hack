'use client';

import { ShieldCheck, ShieldX } from 'lucide-react';
import { useSession } from '@/entities/session';
import { launchStages } from '@/entities/scenario';
import { cn, criticalityLevel, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { IndeterminateBar } from '@/shared/ui';
import type { ResilienceResponse, ScenarioDocument } from '@/shared/api';

interface ResilienceSummaryProps {
  scenario: ScenarioDocument;
  resilience: ResilienceResponse | undefined;
  loading: boolean;
}

const LEGEND = [100, 75, 50, 0];











export function ResilienceSummary({ scenario, resilience, loading }: ResilienceSummaryProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();

  const stage = state.config.launch_stage ?? scenario.design.launch_stage;
  const stages = launchStages(scenario);
  const deployed = stages.find((info) => info.stage === stage)?.satelliteCount ?? 0;

  const base = resilience?.baseline_worst_availability ?? 0;
  const target = resilience?.target_availability ?? scenario.environment.target_availability;
  const worstImpact = resilience?.impacts[0];
  const worstAfter = worstImpact ? base - worstImpact.worst_availability_drop : base;
  const breaking = resilience?.impacts.filter((impact) => impact.breaks_target) ?? [];
  const belowAlready = resilience !== undefined && base < target;
  const holds = resilience !== undefined && !belowAlready && breaking.length === 0;

  return (
    <div
      data-tour="resilience-verdict"
      className="absolute left-3 top-3 z-10 w-[240px] border border-rule-strong bg-black p-3.5 sm:w-[276px] lg:left-6 lg:top-6 lg:p-5"
    >
      <div className="font-label text-[13px] text-zinc-300">{t('res.title')}</div>

      <div className="mt-2.5 flex border border-rule-strong" role="group" aria-label={t('res.stage')}>
        {stages.map((info) => (
          <button
            key={info.stage}
            type="button"
            onClick={() => dispatch({ type: 'setLaunchStage', stage: info.stage })}
            aria-pressed={stage === info.stage}
            className={cn(
              'flex flex-1 flex-col items-center border-l border-rule-strong py-1 transition-colors first:border-l-0 focus-visible:outline-none',
              stage === info.stage ? 'bg-white/[0.12] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200',
            )}
          >
            <span className="font-data text-[11px] tabular-nums">{info.stage}</span>
            <span className="font-data text-[8px] tabular-nums opacity-70">
              {t('deploy.sv', { count: info.satelliteCount })}
            </span>
          </button>
        ))}
      </div>

      {loading && !resilience ? (
        <div className="mt-3">
          <div className="font-label text-[12px] text-zinc-400">
            {t('res.scoring', { count: deployed })}
          </div>
          <div className="mt-1 font-data text-[10px] text-zinc-600">{t('res.scoringHint')}</div>
          <div className="mt-2">
            <IndeterminateBar />
          </div>
        </div>
      ) : resilience ? (
        <>
          <div className="mt-3 flex items-start gap-2">
            {holds ? (
              <ShieldCheck size={16} className="mt-px flex-shrink-0 text-zinc-100" />
            ) : (
              <ShieldX size={16} className="mt-px flex-shrink-0 text-alarm" />
            )}
            <span
              className={cn(
                'font-label text-[13px] leading-snug',
                holds ? 'text-zinc-100' : 'text-alarm',
              )}
            >
              {belowAlready
                ? t('res.belowAlready')
                : holds
                  ? t('res.holds')
                  : t('res.breaks', { count: breaking.length })}
            </span>
          </div>

          <div className="mt-3 space-y-1.5 font-data text-[12px] tabular-nums">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-label text-[12px] text-zinc-400">{t('res.noFailures')}</span>
              <span className={base >= target ? 'text-zinc-100' : 'text-alarm'}>
                {formatPercent(base)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-label text-[12px] text-zinc-400">{t('res.worstAfter')}</span>
              <span className={worstAfter >= target ? 'text-zinc-100' : 'text-alarm'}>
                {formatPercent(worstAfter)}
              </span>
            </div>
            {worstImpact && (
              <div className="font-label text-[10px] text-zinc-500">
                {t('res.mostDangerous', {
                  sat: worstImpact.satellite_id,
                  drop: (worstImpact.worst_availability_drop * 100).toFixed(2),
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      <div className="mt-3 border-t border-rule pt-2.5">
        <div className="mb-1.5 font-label text-[10px] text-zinc-500">{t('criticality.legend')}</div>
        <div className="space-y-1">
          {LEGEND.map((sample) => {
            const level = criticalityLevel(sample);
            return (
              <div key={level.tier} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0" style={{ background: level.color }} />
                <span className="font-label text-[11px] text-zinc-400">
                  {t(`criticality.${level.tier}` as 'criticality.low')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
