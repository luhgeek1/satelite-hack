'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  analysisApi,
  queryKeys,
  type OptimizeRequest,
  type PlaneBounds,
} from '@/shared/api';
import { normalizeConfig, type RunInput } from '@/entities/simulation';

export interface PlaneLock {
  planeId: string;
  raanLocked: boolean;
  phaseLocked: boolean;
}

export type SearchDepth = 'quick' | 'standard' | 'thorough';

export const SEARCH_DEPTHS: Record<SearchDepth, { label: string; coarseSteps: number; refineRounds: number }> = {
  quick: { label: 'Quick', coarseSteps: 3, refineRounds: 2 },
  standard: { label: 'Standard', coarseSteps: 4, refineRounds: 2 },
  thorough: { label: 'Thorough', coarseSteps: 5, refineRounds: 2 },
};

export const freeAxes = (locks: PlaneLock[]) =>
  locks.reduce((count, lock) => count + (lock.raanLocked ? 0 : 1) + (lock.phaseLocked ? 0 : 1), 0);

/** Every point of the coarse grid is a full 24-hour run, so the count is the
 *  honest unit of cost to put in front of the engineer before they commit. */
export const gridSize = (locks: PlaneLock[], depth: SearchDepth) => {
  const axes = freeAxes(locks);
  return axes === 0 ? 0 : SEARCH_DEPTHS[depth].coarseSteps ** axes;
};

const toBounds = (locks: PlaneLock[]): PlaneBounds[] =>
  locks.map((lock) => ({
    plane_id: lock.planeId,
    raan_deg: lock.raanLocked ? null : [0, 360],
    phase_deg: lock.phaseLocked ? null : [0, 22.5],
  }));

export function useOptimizer(input: RunInput) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const start = useMutation({
    mutationFn: ({ locks, depth }: { locks: PlaneLock[]; depth: SearchDepth }) => {
      const { coarseSteps, refineRounds } = SEARCH_DEPTHS[depth];
      const payload: OptimizeRequest = {
        scenario_id: input.scenarioId as string,
        config: normalizeConfig(input.config),
        strategy: input.strategy,
        objective: 'worst_first',
        bounds: toBounds(locks),
        coarse_steps: coarseSteps,
        refine_rounds: refineRounds,
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
