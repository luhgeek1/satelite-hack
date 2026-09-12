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

const toBounds = (locks: PlaneLock[]): PlaneBounds[] =>
  locks.map((lock) => ({
    plane_id: lock.planeId,
    raan_deg: lock.raanLocked ? null : [0, 360],
    phase_deg: lock.phaseLocked ? null : [0, 22.5],
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

export function useOptimizer(input: RunInput) {
  const [jobId, setJobId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: (locks: PlaneLock[]) => {
      const payload: OptimizeRequest = {
        scenario_id: input.scenarioId as string,
        config: normalizeConfig(input.config),
        strategy: input.strategy,
        objective: 'worst_first',
        bounds: toBounds(locks),
        coarse_steps: 4,
        refine_rounds: 1,
      };
      return analysisApi.optimize(payload);
    },
    onSuccess: (job) => setJobId(job.id),
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

  return {
    start,
    status: status.data,
    result: result.data,
    running: status.data?.status === 'queued' || status.data?.status === 'running',
    dismiss: () => setJobId(null),
  };
}
