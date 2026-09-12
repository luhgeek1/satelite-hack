import { downloadUrl, request } from './http';
import type {
  AvailabilitySample,
  CompareResponse,
  EphemerisResponse,
  JobStatus,
  OptimizeRequest,
  OptimizeResult,
  ResilienceResponse,
  RunRequest,
  ScenarioDetail,
  ScenarioImported,
  ScenarioSummary,
  SensitivityResponse,
  SiteProfile,
  SimulationSummary,
  SnapshotResponse,
  ValidationReport,
  Variant,
  VariantCreate,
} from './types';

export const scenariosApi = {
  list: () => request<ScenarioSummary[]>('/scenarios'),
  detail: (id: string) => request<ScenarioDetail>(`/scenarios/${id}`),
  validate: (document: unknown) =>
    request<ValidationReport>('/scenarios/validate', { method: 'POST', body: document }),
  /** Takes whatever the file held: the server names what is wrong with it. */
  import: (document: unknown) =>
    request<ScenarioImported>('/scenarios', { method: 'POST', body: document }),
  remove: (id: string) => request<void>(`/scenarios/${id}`, { method: 'DELETE' }),
  rename: (id: string, title: string) =>
    request<ScenarioSummary>(`/scenarios/${id}`, { method: 'PATCH', body: { title } }),
  downloadUrl: (id: string) => downloadUrl(`/scenarios/${id}/download`),
  siteProfiles: () => request<SiteProfile[]>('/scenarios/site-profiles'),
};

export const simulationsApi = {
  run: (payload: RunRequest) =>
    request<SimulationSummary>('/simulations', { method: 'POST', body: payload }),
  summary: (runId: string) => request<SimulationSummary>(`/simulations/${runId}`),
  snapshot: (runId: string, tS: number, signal?: AbortSignal) =>
    request<SnapshotResponse>(`/simulations/${runId}/snapshot`, { query: { t_s: tS }, signal }),
  ephemeris: (runId: string, stepS?: number, signal?: AbortSignal) =>
    request<EphemerisResponse>(`/simulations/${runId}/ephemeris`, {
      query: { step_s: stepS },
      signal,
    }),
  availability: (runId: string, signal?: AbortSignal) =>
    request<AvailabilitySample[]>(`/simulations/${runId}/availability`, { signal }),
  exportUrl: (runId: string) => downloadUrl(`/simulations/${runId}/export`),
  scenarioUrl: (runId: string) => downloadUrl(`/simulations/${runId}/scenario`),
};

export const analysisApi = {
  resilience: (payload: RunRequest, signal?: AbortSignal) =>
    request<ResilienceResponse>('/analysis/resilience', {
      method: 'POST',
      body: payload,
      signal,
    }),
  sensitivity: (payload: RunRequest & { parameter: string; values: number[] }) =>
    request<SensitivityResponse>('/analysis/sensitivity', { method: 'POST', body: payload }),
  optimize: (payload: OptimizeRequest) =>
    request<JobStatus>('/analysis/optimize', { method: 'POST', body: payload }),
  job: (jobId: string) => request<JobStatus>(`/jobs/${jobId}`),
  jobResult: (jobId: string) => request<OptimizeResult>(`/jobs/${jobId}/result`),
};

export const variantsApi = {
  list: () => request<Variant[]>('/variants'),
  create: (payload: VariantCreate) =>
    request<Variant>('/variants', { method: 'POST', body: payload }),
  remove: (id: string) => request<void>(`/variants/${id}`, { method: 'DELETE' }),
  compare: (variantIds: string[]) =>
    request<CompareResponse>('/variants/compare', {
      method: 'POST',
      body: { variant_ids: variantIds },
    }),
};
