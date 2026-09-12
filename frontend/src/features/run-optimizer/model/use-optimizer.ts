'use client';

import { useState } from 'react';
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
import { phasePeriodDeg } from '@/entities/scenario';

export interface PlaneLock {
  planeId: string;
  raanLocked: boolean;
  phaseLocked: boolean;
}

export type SearchDepth = 'quick' | 'standard' | 'thorough';

interface DepthPreset {
  method: 'coordinate_descent' | 'grid';
  axisSteps: number;
  passes: number;
  starts: number;
  coarseSteps: number;
  refineRounds: number;
}

/**
 * The two cheap presets sweep one angle at a time; the expensive one enumerates
 * the whole grid. Exhaustive is offered last on purpose: at six free axes it
 * costs an order of magnitude more and, because the same budget buys only four
 * samples per angle, it has measured *worse* on the official scenario than the
 * fine one-dimensional sweeps.
 */
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
  thorough: {
    method: 'grid',
    axisSteps: 12,
    passes: 3,
    starts: 3,
    coarseSteps: 4,
    refineRounds: 1,
  },
};

/** Measured on the official scenario: one configuration is a full 24-hour run,
 *  and the fan-out only reaches about 2x over eight workers, so the wall clock
 *  stays far closer to the serial cost than the core count suggests. */
const SECONDS_PER_RUN = 0.11;

export const estimateSeconds = (runs: number) => Math.round(runs * SECONDS_PER_RUN);

export const freeAxes = (locks: PlaneLock[]) =>
  locks.reduce((count, lock) => count + (lock.raanLocked ? 0 : 1) + (lock.phaseLocked ? 0 : 1), 0);

/** Mirrors `planned_runs` in the engine: the count the search is allowed to
 *  spend, so the quote on the button matches the total on the progress bar. */
export const gridSize = (locks: PlaneLock[], depth: SearchDepth) => {
  const axes = freeAxes(locks);
  if (axes === 0) return 0;

  const preset = SEARCH_DEPTHS[depth];
  const refinement = preset.refineRounds * 2 * axes;

  return preset.method === 'grid'
    ? preset.coarseSteps ** axes + refinement + 1
    : preset.starts * (1 + preset.passes * axes * preset.axisSteps) + refinement + 1;
};

/**
 * RAAN always sweeps the full circle. Phase sweeps one period of the plane —
 * a full turn unless the slots are uniform and unbroken, in which case one
 * slot spacing already covers every distinct geometry (see `phasePeriodDeg`).
 */
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

/** Turns the optimizer's answer into the overrides the session config takes. */
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

/** Every plane free to move: what the search assumes unless locks say otherwise. */
export const freeLocks = (planeIds: string[]): PlaneLock[] =>
  planeIds.map((planeId) => ({ planeId, raanLocked: false, phaseLocked: false }));

export type Optimizer = ReturnType<typeof useOptimizer>;

export function useOptimizer(input: RunInput, scenario: ScenarioDocument | undefined) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const start = useMutation({
    /**
     * `config` overrides what the search is scored against. Planning a launch
     * needs it: the angles are chosen at that launch but judged on the finished
     * constellation, which is a different launch stage than the one on screen.
     */
    mutationFn: ({
      locks,
      depth,
      config,
    }: {
      locks: PlaneLock[];
      depth: SearchDepth;
      config?: SimulationConfig;
    }) => {
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
      return state === 'done' || state === 'failed' ? false : 700;
    },
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

  return {
    start,
    status: status.data,
    result: result.data,
    remainingS,
    running: status.data?.status === 'queued' || status.data?.status === 'running',
    dismiss: () => {
      setJobId(null);
      setStartedAt(null);
    },
  };
}
