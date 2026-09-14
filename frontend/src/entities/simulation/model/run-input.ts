import type { RoutingStrategy, SimulationConfig } from '@/shared/api';

export interface RunInput {
  scenarioId: string | null;
  config: SimulationConfig;
  strategy: RoutingStrategy;
}

export const emptyConfig: SimulationConfig = {};

export function normalizeConfig(config: SimulationConfig): SimulationConfig {
  const normalized: SimulationConfig = {};

  if (config.launch_stage !== undefined) normalized.launch_stage = config.launch_stage;

  if (config.planes && Object.keys(config.planes).length > 0) {
    normalized.planes = Object.fromEntries(
      Object.keys(config.planes)
        .sort()
        .map((planeId) => [planeId, config.planes![planeId]]),
    );
  }

  if (config.failures) {
    normalized.failures = [...config.failures].sort(
      (a, b) => a.satellite_id.localeCompare(b.satellite_id) || a.start_s - b.start_s,
    );
  }

  if (config.gateway_outages) {
    normalized.gateway_outages = [...config.gateway_outages].sort(
      (a, b) => a.gateway_id.localeCompare(b.gateway_id) || a.start_s - b.start_s,
    );
  }

  if (config.sites && Object.keys(config.sites).length > 0) {
    normalized.sites = Object.fromEntries(
      Object.keys(config.sites)
        .sort()
        .map((siteId) => [siteId, config.sites![siteId]]),
    );
  }

  for (const key of ['isl_range_km', 'min_elevation_deg', 'altitude_km', 'inclination_deg'] as const) {
    if (config[key] !== undefined) normalized[key] = config[key];
  }

  return normalized;
}


const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
};









export const configKey = (config: SimulationConfig) =>
  JSON.stringify(canonical(normalizeConfig(config)));

export const sameConfig = (left: SimulationConfig, right: SimulationConfig) =>
  configKey(left) === configKey(right);
