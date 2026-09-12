'use client';

import { useMutation } from '@tanstack/react-query';
import { analysisApi, type SensitivityResponse } from '@/shared/api';
import { normalizeConfig, type RunInput } from '@/entities/simulation';

export type SweepParameter = 'isl_range_km' | 'min_elevation_deg' | 'altitude_km';

export interface SweepSpec {
  parameter: SweepParameter;
  label: string;
  unit: string;
  values: number[];
  rationale: string;
}

/**
 * Ranges chosen to straddle where the answer changes rather than to cover the
 * whole legal span. The ISL sweep is the important one: at 16 satellites per
 * plane the in-plane neighbours sit 2700 km apart, so the along-orbit mesh
 * either forms or it does not, and the samples bracket that edge.
 */
export const SWEEPS: SweepSpec[] = [
  {
    parameter: 'isl_range_km',
    label: 'Inter-satellite range',
    unit: 'km',
    values: [2000, 2200, 2400, 2600, 2700, 2750, 2800, 3000],
    rationale:
      'In-plane neighbours sit 2700 km apart, so the along-orbit mesh forms or fails across this range.',
  },
  {
    parameter: 'min_elevation_deg',
    label: 'Elevation mask',
    unit: '°',
    values: [5, 10, 15, 20, 25],
    rationale: 'A lower mask buys contact time at the cost of a longer, shallower ground link.',
  },
  {
    parameter: 'altitude_km',
    label: 'Orbit altitude',
    unit: 'km',
    values: [400, 500, 550, 700, 900],
    rationale: 'Higher orbits see further, at the cost of more satellites needed per plane.',
  },
];

export function useSensitivitySweep(input: RunInput) {
  return useMutation<SensitivityResponse, Error, SweepSpec>({
    mutationFn: (spec) =>
      analysisApi.sensitivity({
        scenario_id: input.scenarioId as string,
        config: normalizeConfig(input.config),
        strategy: input.strategy,
        parameter: spec.parameter,
        values: spec.values,
      }),
  });
}
