'use client';

import { useSession } from '@/entities/session';
import { launchStages } from '@/entities/scenario';
import { cn } from '@/shared/lib';
import type { ScenarioDocument } from '@/shared/api';

export function DeploymentControl({ scenario }: { scenario: ScenarioDocument }) {
  const { state, dispatch } = useSession();
  const stages = launchStages(scenario);
  const current = state.config.launch_stage ?? scenario.design.launch_stage;

  return (
    <>
      <div className="mt-1 flex border border-rule-strong">
        {stages.map(({ stage, satelliteCount }) => (
          <button
            key={stage}
            type="button"
            onClick={() => dispatch({ type: 'setLaunchStage', stage })}
            aria-pressed={current === stage}
            aria-label={`Deploy ${satelliteCount} satellites`}
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
        Stage {current} of {stages.length}, {scenario.design.planes.length} orbital planes.
      </p>
    </>
  );
}
