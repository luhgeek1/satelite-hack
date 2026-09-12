'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  simulationsApi,
  type AvailabilitySample,
  type EphemerisResponse,
  type SimulationSummary,
  type SnapshotResponse,
} from '@/shared/api';
import { normalizeConfig, type RunInput } from '../model/run-input';

const runKey = (input: RunInput) => ({
  scenarioId: input.scenarioId,
  config: normalizeConfig(input.config),
  strategy: input.strategy,
});

export function useSimulation(input: RunInput) {
  return useQuery({
    queryKey: queryKeys.simulation(runKey(input)),
    queryFn: () =>
      simulationsApi.run({
        scenario_id: input.scenarioId as string,
        config: normalizeConfig(input.config),
        strategy: input.strategy,
      }),
    enabled: Boolean(input.scenarioId),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
}

export function useSnapshot(runId: string | undefined, tS: number) {
  return useQuery({
    queryKey: queryKeys.snapshot(runId ?? '', tS),
    queryFn: ({ signal }) => simulationsApi.snapshot(runId as string, tS, signal),
    enabled: Boolean(runId),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
}

export function useEphemeris(runId: string | undefined, stepS?: number) {
  return useQuery({
    queryKey: queryKeys.ephemeris(runId ?? '', stepS),
    queryFn: ({ signal }) => simulationsApi.ephemeris(runId as string, stepS, signal),
    enabled: Boolean(runId),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
}

export function useAvailabilitySeries(runId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.availability(runId ?? ''),
    queryFn: ({ signal }) => simulationsApi.availability(runId as string, signal),
    enabled: Boolean(runId),
    staleTime: Infinity,
  });
}

export function useSnapshotPrefetch(runId: string | undefined, stepS: number, horizonS: number) {
  const queryClient = useQueryClient();

  return (tS: number, ahead = 3) => {
    if (!runId) return;

    for (let offset = 1; offset <= ahead; offset += 1) {
      const target = (tS + offset * stepS) % horizonS;
      void queryClient.prefetchQuery({
        queryKey: queryKeys.snapshot(runId, target),
        queryFn: ({ signal }) => simulationsApi.snapshot(runId, target, signal),
        staleTime: Infinity,
      });
    }
  };
}

export type {
  AvailabilitySample,
  EphemerisResponse,
  SimulationSummary,
  SnapshotResponse,
};
