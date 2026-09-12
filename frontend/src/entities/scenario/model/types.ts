import type { PlaneDto, ScenarioDocument } from '@/shared/api';

export interface PlaneView {
  id: string;
  raanDeg: number;
  phaseDeg: number;
  color: string;
  satelliteCount: number;
}

export interface ScenarioGeometry {
  inclinationDeg: number;
  altitudeKm: number;
  earthAngle0Deg: number;
  stepS: number;
  horizonS: number;
  steps: number;
  targetAvailability: number;
  islRangeKm: number;
  minElevationDeg: number;
}

export interface LaunchStageInfo {
  stage: 1 | 2 | 3;
  satelliteCount: number;
}

export const readGeometry = (scenario: ScenarioDocument): ScenarioGeometry => ({
  inclinationDeg: scenario.environment.inclination_deg,
  altitudeKm: scenario.environment.altitude_km,
  earthAngle0Deg: scenario.environment.earth_angle0_deg,
  stepS: scenario.environment.step_s,
  horizonS: scenario.environment.horizon_s,
  steps: Math.floor(scenario.environment.horizon_s / scenario.environment.step_s),
  targetAvailability: scenario.environment.target_availability,
  islRangeKm: scenario.environment.isl_range_km,
  minElevationDeg: scenario.environment.min_elevation_deg,
});

export const readPlaneDto = (scenario: ScenarioDocument, planeId: string): PlaneDto | undefined =>
  scenario.design.planes.find((plane) => plane.id === planeId);

export const launchStages = (scenario: ScenarioDocument): LaunchStageInfo[] =>
  ([1, 2, 3] as const).map((stage) => ({
    stage,
    satelliteCount: scenario.design.satellites.filter((sat) => sat.launch_batch <= stage).length,
  }));
