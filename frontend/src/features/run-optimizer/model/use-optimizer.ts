'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  analysisApi,
  queryKeys,
  type OptimizeRequest,
  type PlaneBounds,
  type ScenarioDocument,
  type SimulationConfig,
} from '@/shared/api';
import { normalizeConfig, type RunInput } from '@/entities/simulation';
import { freeLocks, phasePeriodDeg, type PlaneLock } from '@/entities/scenario';

export { freeLocks, type PlaneLock };

export type SearchDepth = 'quick' | 'standard';

interface DepthPreset {
  method: 'coordinate_descent';
  axisSteps: number;
  passes: number;
  starts: number;
  coarseSteps: number;
  refineRounds: number;
}






export const SEARCH_DEPTHS: Record<SearchDepth, DepthPreset> = {
  quick: {
    method: 'coordinate_descent',
    axisSteps: 12,
    passes: 2,
    starts: 1,
    coarseSteps: 4,
    refineRounds: 1,
  },
  standard: {
    method: 'coordinate_descent',
    axisSteps: 12,
    passes: 3,
    starts: 3,
    coarseSteps: 4,
    refineRounds: 2,
  },
};




const SECONDS_PER_RUN = 0.45;

export const estimateSeconds = (runs: number) => Math.round(runs * SECONDS_PER_RUN);

export const freeAxes = (locks: PlaneLock[]) =>
  locks.reduce((count, lock) => count + (lock.raanLocked ? 0 : 1) + (lock.phaseLocked ? 0 : 1), 0);



export const gridSize = (locks: PlaneLock[], depth: SearchDepth) => {
  const axes = freeAxes(locks);
  if (axes === 0) return 0;

  const preset = SEARCH_DEPTHS[depth];
  const refinement = preset.refineRounds * 2 * axes;

  return preset.starts * (1 + preset.passes * axes * preset.axisSteps) + refinement + 1;
};






export const toBounds = (
  locks: PlaneLock[],
  scenario: ScenarioDocument | undefined,
  input: RunInput,
): PlaneBounds[] =>
  locks.map((lock) => ({
    plane_id: lock.planeId,
    raan_deg: lock.raanLocked ? null : [0, 360],
    phase_deg: lock.phaseLocked
      ? null
      : [
          0,
          scenario
            ? phasePeriodDeg(scenario, lock.planeId, {
                launchStage: input.config.launch_stage,
                failures: input.config.failures,
              })
            : 360,
        ],
  }));


export const toPlaneOverrides = (
  changed: Record<string, { raan_deg: number | null; phase_deg: number | null }>,
): Record<string, { raan_deg?: number; phase_deg?: number }> =>
  Object.fromEntries(
    Object.entries(changed).map(([planeId, change]) => [
      planeId,
      {
        ...(change.raan_deg !== null ? { raan_deg: change.raan_deg } : {}),
        ...(change.phase_deg !== null ? { phase_deg: change.phase_deg } : {}),
      },
    ]),
  );

export interface SearchRequest {
  locks: PlaneLock[];
  depth: SearchDepth;





  config?: SimulationConfig;
}

export type Optimizer = ReturnType<typeof useOptimizer>;

export function useOptimizer(input: RunInput, scenario: ScenarioDocument | undefined) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);




  const [searched, setSearched] = useState<RunInput | null>(null);


  const abandoned = useRef(false);

  const start = useMutation({


    onMutate: ({ config }: SearchRequest) => {
      abandoned.current = false;
      setSearched({
        scenarioId: input.scenarioId,
        config: normalizeConfig(config ?? input.config),
        strategy: input.strategy,
      });
    },

    mutationFn: ({ locks, depth, config }: SearchRequest) => {
      const preset = SEARCH_DEPTHS[depth];
      const payload: OptimizeRequest = {
        scenario_id: input.scenarioId as string,
        config: normalizeConfig(config ?? input.config),
        strategy: input.strategy,
        objective: 'worst_first',
        bounds: toBounds(locks, scenario, input),
        method: preset.method,
        coarse_steps: preset.coarseSteps,
        refine_rounds: preset.refineRounds,
        axis_steps: preset.axisSteps,
        passes: preset.passes,
        starts: preset.starts,
      };
      return analysisApi.optimize(payload);
    },
    onSuccess: (job) => {
      if (abandoned.current) {
        abandoned.current = false;
        void analysisApi.cancelJob(job.id);
        return;
      }
      setJobId(job.id);
      setStartedAt(Date.now());
    },
  });

  const status = useQuery({
    queryKey: queryKeys.job(jobId ?? ''),
    queryFn: () => analysisApi.job(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const state = query.state.data?.status;
      return state === 'done' || state === 'failed' || state === 'cancelled' ? false : 700;
    },
  });




  const cancel = useMutation({
    mutationFn: (id: string) => analysisApi.cancelJob(id),
  });

  const result = useQuery({
    queryKey: queryKeys.jobResult(jobId ?? ''),
    queryFn: () => analysisApi.jobResult(jobId as string),
    enabled: Boolean(jobId) && status.data?.status === 'done',
    staleTime: Infinity,
  });

  const explored = status.data?.explored ?? 0;
  const total = status.data?.total ?? 0;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  const remainingS =
    explored > 0 && total > explored && elapsedMs > 1500
      ? Math.round(((elapsedMs / explored) * (total - explored)) / 1000)
      : null;

  const dismiss = () => {
    setJobId(null);
    setStartedAt(null);
    setSearched(null);
  };

  const running = status.data?.status === 'queued' || status.data?.status === 'running';

  return {
    start,
    status: status.data,
    result: result.data,
    searched,
    remainingS,
    running,
    stop: () => {
      if (jobId) cancel.mutate(jobId);
      else if (start.isPending) abandoned.current = true;
      dismiss();
    },
    dismiss,
  };
}
