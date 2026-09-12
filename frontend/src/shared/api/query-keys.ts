import type { RunRequest, SimulationConfig, RoutingStrategy } from './types';

export interface RunKey {
  scenarioId: string | null;
  config: SimulationConfig;
  strategy: RoutingStrategy;
}

export const queryKeys = {
  scenarios: ['scenarios'] as const,
  scenario: (id: string) => ['scenarios', id] as const,
  siteProfiles: ['scenarios', 'site-profiles'] as const,

  simulation: (key: RunKey) => ['simulation', key] as const,
  snapshot: (runId: string, tS: number) => ['simulation', runId, 'snapshot', tS] as const,
  ephemeris: (runId: string, stepS?: number) =>
    ['simulation', runId, 'ephemeris', stepS ?? null] as const,
  availability: (runId: string) => ['simulation', runId, 'availability'] as const,
  routeTimeline: (runId: string, clientId: string) =>
    ['simulation', runId, 'routes', clientId] as const,

  resilience: (key: RunKey) => ['resilience', key] as const,
  sensitivity: (scenarioId: string, parameter: string, values: number[]) =>
    ['sensitivity', scenarioId, parameter, values] as const,

  job: (jobId: string) => ['jobs', jobId] as const,
  jobResult: (jobId: string) => ['jobs', jobId, 'result'] as const,

  variants: ['variants'] as const,
  comparison: (ids: string[]) => ['variants', 'compare', ids] as const,
};

export const runKeyOf = (request: RunRequest): RunKey => ({
  scenarioId: request.scenario_id ?? null,
  config: request.config ?? {},
  strategy: request.strategy ?? 'min_hops',
});
