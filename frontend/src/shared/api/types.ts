export type RoutingStrategy = 'min_hops' | 'min_distance';

export type NoRouteReason =
  | 'no_visible_satellite'
  | 'network_partition'
  | 'no_gateway_contact'
  | 'gateway_unavailable';

export type GroundSiteRole = 'client' | 'gateway';

export interface EnvironmentDto {
  altitude_km: number;
  inclination_deg: number;
  earth_angle0_deg: number;
  horizon_s: number;
  step_s: number;
  min_elevation_deg: number;
  isl_range_km: number;
  target_availability: number;
}

export interface PlaneDto {
  id: string;
  raan_deg: number;
  phase_deg: number;
}

export interface SatelliteDto {
  id: string;
  plane_id: string;
  slot_deg: number;
  launch_batch: 1 | 2 | 3;
}

export type SiteProfileName = 'open' | 'sea' | 'forest' | 'urban' | 'mountain' | 'custom';

/**
 * What surrounds a ground site. The effective mask is the higher of the
 * scenario's mask and the local one, so conditions only ever remove links.
 */
export interface SiteConditionsDto {
  profile: SiteProfileName;
  mask_deg?: number | null;
  altitude_m?: number | null;
  azimuth_mask?: [number, number][] | null;
}

export interface SiteProfile {
  id: SiteProfileName;
  mask_deg: number;
  altitude_m: number;
  rationale: string;
}

export interface GroundSiteDto {
  id: string;
  name: string;
  role: GroundSiteRole;
  lat_deg: number;
  lon_deg: number;
  site_conditions?: SiteConditionsDto | null;
}

export interface FailureDto {
  satellite_id: string;
  start_s: number;
  end_s: number;
}

export interface GatewayOutageDto {
  gateway_id: string;
  start_s: number;
  end_s: number;
}

export interface ScenarioDocument {
  schema_version: 'cosmo-A-1.0';
  meta: { id: string; title: string };
  environment: EnvironmentDto;
  design: { launch_stage: 1 | 2 | 3; planes: PlaneDto[]; satellites: SatelliteDto[] };
  ground_sites: GroundSiteDto[];
  failures: FailureDto[];
  gateway_outages: GatewayOutageDto[];
}

export interface ScenarioSummary {
  id: string;
  title: string;
  source: 'official' | 'imported';
  satellite_count: number;
  plane_count: number;
  client_count: number;
  gateway_count: number;
  launch_stage: number;
  horizon_s: number;
  step_s: number;
  steps: number;
  target_availability: number;
  created_at: string | null;
}

export interface ScenarioDetail {
  summary: ScenarioSummary;
  scenario: ScenarioDocument;
}

export interface ValidationReport {
  valid: boolean;
  error: string | null;
  field: string | null;
}

export interface PlaneConfig {
  raan_deg?: number;
  phase_deg?: number;
}

export interface SimulationConfig {
  launch_stage?: 1 | 2 | 3;
  planes?: Record<string, PlaneConfig>;
  failures?: FailureDto[];
  gateway_outages?: GatewayOutageDto[];
  /** A value sets a site's surroundings; `null` clears the block its file carried. */
  sites?: Record<string, SiteConditionsDto | null>;
  isl_range_km?: number;
  min_elevation_deg?: number;
  altitude_km?: number;
  inclination_deg?: number;
  step_s?: number;
  horizon_s?: number;
}

export interface RunRequest {
  scenario_id?: string;
  scenario?: ScenarioDocument;
  config?: SimulationConfig;
  strategy?: RoutingStrategy;
  label?: string | null;
}

export interface OutageWindow {
  client_id: string;
  start_s: number;
  end_s: number;
  duration_s: number;
  reason: NoRouteReason | null;
  leading: boolean;
  trailing: boolean;
}

export interface ClientMetrics {
  client_id: string;
  name: string;
  visibility: number;
  availability: number;
  meets_target: boolean;
  max_outage_s: number;
  max_bounded_outage_s: number;
  leading_outage_s: number;
  trailing_outage_s: number;
  avg_hops: number | null;
  min_hops: number | null;
  max_hops: number | null;
  outage_reasons: Record<string, number>;
  outage_windows: OutageWindow[];
  site_profile: SiteProfileName | null;
  effective_mask_deg: number | null;
  masked_share: number;
}

export interface SimulationSummary {
  id: string;
  scenario_id: string | null;
  label: string | null;
  strategy: RoutingStrategy;
  created_at: string;
  target_availability: number;
  step_s: number;
  horizon_s: number;
  steps: number;
  worst_availability: number;
  mean_availability: number;
  meets_target: boolean;
  clients: ClientMetrics[];
  config: SimulationConfig;
  environment_modified: boolean;
  site_conditions_active: boolean;
  effective_scenario: ScenarioDocument;
  compute_ms: number;
}

export interface SatelliteState {
  id: string;
  lat_deg: number;
  lon_deg: number;
  alt_km: number;
  x_km: number;
  y_km: number;
  z_km: number;
  active: boolean;
}

export interface SnapshotEdge {
  source: string;
  target: string;
  distance_km: number;
  type: 'isl' | 'ground' | 'gateway';
}

export interface RouteDto {
  client_id: string;
  available: boolean;
  path: string[];
  hops: number | null;
  distance_km: number | null;
  reason: NoRouteReason | null;
  gateway_id: string | null;
}

export interface SnapshotResponse {
  t_s: number;
  satellites: SatelliteState[];
  edges: SnapshotEdge[];
  routes: RouteDto[];
  elevation_deg: Record<string, Record<string, number>>;
  offline_gateways: string[];
  /** Per site: satellites above the scenario mask that its surroundings hide. */
  masked_satellites: Record<string, string[]>;
  active_satellites: number;
  total_satellites: number;
}

export interface EphemerisSample {
  t_s: number;
  satellites: SatelliteState[];
}

export interface EphemerisResponse {
  step_s: number;
  horizon_s: number;
  samples: EphemerisSample[];
}

export type AvailabilityState = 'routed' | 'visible_no_route' | 'no_satellite';

export interface AvailabilitySample {
  t_s: number;
  state: Record<string, AvailabilityState>;
}

export interface SatelliteImpact {
  satellite_id: string;
  plane_id: string;
  worst_availability_drop: number;
  mean_availability_drop: number;
  per_client_drop: Record<string, number>;
  breaks_target: boolean;
  criticality: number;
  per_client_outage_growth_s: Record<string, number>;
}

export interface GatewayDependency {
  gateway_id: string;
  serving_satellites: string[];
  busiest_satellite: string | null;
  busiest_share: number;
  contact_availability: number;
  routed_share_by_client: Record<string, number>;
}

export interface ResilienceResponse {
  baseline_worst_availability: number;
  baseline_mean_availability: number;
  target_availability: number;
  impacts: SatelliteImpact[];
  critical_satellite_ids: string[];
  gateway_dependency: GatewayDependency[];
  compute_ms: number;
}

export interface SensitivityPoint {
  value: number;
  worst_availability: number;
  per_client: Record<string, number>;
  meets_target: boolean;
}

export interface SensitivityResponse {
  parameter: string;
  points: SensitivityPoint[];
  threshold: number | null;
  compute_ms: number;
}

export interface PlaneBounds {
  plane_id: string;
  raan_deg?: [number, number] | null;
  phase_deg?: [number, number] | null;
}

export interface OptimizeRequest {
  scenario_id?: string;
  scenario?: ScenarioDocument;
  config?: SimulationConfig;
  strategy?: RoutingStrategy;
  objective?: 'worst_first' | 'mean_first';
  bounds: PlaneBounds[];
  method?: 'coordinate_descent' | 'grid';
  coarse_steps?: number;
  refine_rounds?: number;
  axis_steps?: number;
  passes?: number;
  starts?: number;
}

export interface OptimizeCandidate {
  planes: Record<string, { raan_deg: number | null; phase_deg: number | null }>;
  worst_availability: number;
  mean_availability: number;
  worst_outage_s: number;
  mean_hops: number;
}

export interface OptimizeResult {
  baseline: OptimizeCandidate;
  best: OptimizeCandidate;
  objective: 'worst_first' | 'mean_first';
  improved: boolean;
  explored: number;
  changed_planes: Record<string, { raan_deg: number | null; phase_deg: number | null }>;
  verdict: string;
}

export interface JobStatus {
  id: string;
  kind: 'optimize';
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  explored: number;
  total: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface VariantCreate {
  name: string;
  note?: string | null;
  scenario_id?: string;
  scenario?: ScenarioDocument;
  config?: SimulationConfig;
  strategy?: RoutingStrategy;
}

export interface Variant {
  id: string;
  name: string;
  note: string | null;
  scenario_id: string | null;
  scenario_title: string;
  config: SimulationConfig;
  strategy: RoutingStrategy;
  created_at: string;
  worst_availability: number;
  mean_availability: number;
  meets_target: boolean;
  max_bounded_outage_s: number;
  availability_by_client: Record<string, number>;
  environment_modified: boolean;
}

export interface ParameterDiff {
  path: string;
  label: string;
  values: Array<number | string | null>;
}

export interface ComparedMetric {
  key: string;
  label: string;
  unit: 'fraction' | 'seconds' | 'hops' | 'count';
  values: Array<number | null>;
  higher_is_better: boolean;
}

export interface CompareResponse {
  variants: Variant[];
  changed_parameters: ParameterDiff[];
  metrics: ComparedMetric[];
  per_client_availability: Record<string, number[]>;
  recommendation: string;
}

export interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  detail: string;
  error_code: string;
  instance: string;
  timestamp: string;
  request_id?: string;
  details?: { field?: string } & Record<string, unknown>;
}
