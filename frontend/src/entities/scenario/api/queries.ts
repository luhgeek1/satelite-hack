'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  scenariosApi,
  type ScenarioDetail,
  type ScenarioSummary,
} from '@/shared/api';

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

const RESULT_SCHEMA_VERSION = 'cosmo-A-result-1.0';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A placeholder row for the picker while the import is on its way.
 *
 * The file is whatever someone chose, and checking it is the server's job, so
 * nothing here may assume its shape: a file without `meta` or `design` has to
 * reach the server and come back with the field to fix, not fail in the
 * browser first. Anything that does not read cleanly simply gets no row.
 */
const optimisticSummary = (upload: unknown): ScenarioSummary | null => {
  const document =
    isRecord(upload) && upload.schema_version === RESULT_SCHEMA_VERSION
      ? upload.effective_scenario
      : upload;
  if (!isRecord(document)) return null;

  const { meta, design, environment, ground_sites: sites } = document;
  if (!isRecord(meta) || !isRecord(design) || !isRecord(environment) || !Array.isArray(sites)) {
    return null;
  }
  if (typeof meta.id !== 'string' || !Array.isArray(design.satellites) || !Array.isArray(design.planes)) {
    return null;
  }

  const horizon = Number(environment.horizon_s);
  const step = Number(environment.step_s);
  const role = (name: string) => sites.filter((site) => isRecord(site) && site.role === name).length;

  return {
    id: meta.id,
    title: typeof meta.title === 'string' ? meta.title : meta.id,
    source: 'imported',
    satellite_count: design.satellites.length,
    plane_count: design.planes.length,
    client_count: role('client'),
    gateway_count: role('gateway'),
    launch_stage: Number(design.launch_stage) || 0,
    horizon_s: horizon || 0,
    step_s: step || 0,
    steps: horizon > 0 && step > 0 ? Math.floor(horizon / step) : 0,
    target_availability: Number(environment.target_availability) || 0,
    created_at: new Date().toISOString(),
  };
};

export function useImportScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (document: unknown) => scenariosApi.import(document),

    onMutate: async (document) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.scenarios });
      const previous = queryClient.getQueryData<ScenarioSummary[]>(queryKeys.scenarios);

      const placeholder = optimisticSummary(document);
      if (placeholder) {
        queryClient.setQueryData<ScenarioSummary[]>(queryKeys.scenarios, (current = []) => [
          ...current,
          placeholder,
        ]);
      }

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

export function useDeleteScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scenarioId: string) => scenariosApi.remove(scenarioId),

    onMutate: async (scenarioId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.scenarios });
      const previous = queryClient.getQueryData<ScenarioSummary[]>(queryKeys.scenarios);

      queryClient.setQueryData<ScenarioSummary[]>(queryKeys.scenarios, (current = []) =>
        current.filter((scenario) => scenario.id !== scenarioId),
      );

      return { previous };
    },

    onError: (_error, _scenarioId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.scenarios, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scenarios });
    },
  });
}

export function useRenameScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scenarioId, title }: { scenarioId: string; title: string }) =>
      scenariosApi.rename(scenarioId, title),

    onSuccess: (summary) => {
      queryClient.setQueryData<ScenarioSummary[]>(queryKeys.scenarios, (current = []) =>
        current.map((scenario) => (scenario.id === summary.id ? summary : scenario)),
      );
      queryClient.setQueryData<ScenarioDetail>(queryKeys.scenario(summary.id), (current) =>
        current ? { ...current, summary } : current,
      );
    },
  });
}
