'use client';

import { useQuery } from '@tanstack/react-query';
import { analysisApi, queryKeys, type SatelliteImpact } from '@/shared/api';
import { normalizeConfig, type RunInput } from '@/entities/simulation';

export function useResilience(input: RunInput, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.resilience({
      scenarioId: input.scenarioId,
      config: normalizeConfig(input.config),
      strategy: input.strategy,
    }),
    queryFn: ({ signal }) =>
      analysisApi.resilience(
        {
          scenario_id: input.scenarioId as string,
          config: normalizeConfig(input.config),
          strategy: input.strategy,
        },
        signal,
      ),
    enabled: enabled && Boolean(input.scenarioId),
    staleTime: Infinity,
    gcTime: 15 * 60_000,
  });
}

export const impactIndex = (impacts: SatelliteImpact[] | undefined): Map<string, SatelliteImpact> =>
  new Map((impacts ?? []).map((impact) => [impact.satellite_id, impact]));
