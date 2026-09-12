'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, scenariosApi, type ScenarioDocument, type ScenarioSummary } from '@/shared/api';

export function useScenarios() {
  return useQuery({
    queryKey: queryKeys.scenarios,
    queryFn: () => scenariosApi.list(),
    staleTime: 60_000,
  });
}

export function useScenario(scenarioId: string | null) {
  return useQuery({
    queryKey: queryKeys.scenario(scenarioId ?? ''),
    queryFn: () => scenariosApi.detail(scenarioId as string),
    enabled: Boolean(scenarioId),
    staleTime: 5 * 60_000,
  });
}

const optimisticSummary = (document: ScenarioDocument): ScenarioSummary => ({
  id: document.meta.id,
  title: document.meta.title,
  source: 'imported',
  satellite_count: document.design.satellites.length,
  plane_count: document.design.planes.length,
  client_count: document.ground_sites.filter((site) => site.role === 'client').length,
  gateway_count: document.ground_sites.filter((site) => site.role === 'gateway').length,
  launch_stage: document.design.launch_stage,
  horizon_s: document.environment.horizon_s,
  step_s: document.environment.step_s,
  steps: Math.floor(document.environment.horizon_s / document.environment.step_s),
  target_availability: document.environment.target_availability,
  created_at: new Date().toISOString(),
});

export function useImportScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (document: ScenarioDocument) => scenariosApi.import(document),

    onMutate: async (document) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.scenarios });
      const previous = queryClient.getQueryData<ScenarioSummary[]>(queryKeys.scenarios);

      queryClient.setQueryData<ScenarioSummary[]>(queryKeys.scenarios, (current = []) => [
        ...current,
        optimisticSummary(document),
      ]);

      return { previous };
    },

    onError: (_error, _document, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.scenarios, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scenarios });
    },
  });
}
