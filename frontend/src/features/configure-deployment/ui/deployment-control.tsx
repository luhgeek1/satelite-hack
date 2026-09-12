'use client';

import { Layers } from 'lucide-react';
import { useSession } from '@/entities/session';
import { launchStages, raanSpread } from '@/entities/scenario';
import { cn } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument } from '@/shared/api';

interface DeploymentControlProps {
  scenario: ScenarioDocument;
  onOpenPlan: () => void;
}

export function DeploymentControl({ scenario, onOpenPlan }: DeploymentControlProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();
  const stages = launchStages(scenario);
  const current = state.config.launch_stage ?? scenario.design.launch_stage;
  const spread = raanSpread(scenario, state.config);

  return (
    <>
      <div className="mt-1 flex border border-rule-strong">
        {stages.map(({ stage, satelliteCount }) => (
          <button
            key={stage}
            type="button"
            onClick={() => dispatch({ type: 'setLaunchStage', stage })}
            aria-pressed={current === stage}
            aria-label={t('config.deployAria', { count: satelliteCount })}
            className={cn(
              'flex-1 border-l border-rule-strong py-1.5 font-data text-[11px] tabular-nums transition-colors first:border-l-0 focus-visible:bg-white/15 focus-visible:text-zinc-100 focus-visible:outline-none',
              current === stage
                ? 'bg-zinc-100 text-black'
                : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200',
            )}
          >
            {satelliteCount}
          </button>
        ))}
      </div>
      <p className="mt-2 font-label text-[11px] leading-relaxed text-zinc-500">
        {t('config.deploymentHint', {
          stage: current,
          total: stages.length,
          planes: scenario.design.planes.length,
        })}
      </p>

      {/* The switch shows one launch; the plan is about all of them at once,
          and the angles chosen here have to serve every stage that follows. */}
      <button
        type="button"
        onClick={onOpenPlan}
        className="mt-2 flex w-full items-center gap-2 border border-rule-strong px-2 py-1.5 font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:border-zinc-400 focus-visible:outline-none"
      >
        <Layers size={12} />
        {t('deploy.open')}
        {spread && !spread.even && (
          <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-alarm">
            {t('deploy.spreadUneven')}
          </span>
        )}
      </button>
    </>
  );
}
