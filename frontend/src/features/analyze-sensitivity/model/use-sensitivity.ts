'use client';

import { useMutation } from '@tanstack/react-query';
import { analysisApi, type SensitivityResponse } from '@/shared/api';
import { normalizeConfig, type RunInput } from '@/entities/simulation';

export type SweepParameter = 'isl_range_km' | 'min_elevation_deg' | 'altitude_km';

export interface SweepSpec {
  parameter: SweepParameter;
  /** Dictionary keys: the sweep is data, its wording is not. */
  labelKey: 'sweep.isl.label' | 'sweep.elev.label' | 'sweep.alt.label';
  tokenKey: 'sweep.isl' | 'sweep.elev' | 'sweep.alt';
  rationaleKey: 'sweep.isl.rationale' | 'sweep.elev.rationale' | 'sweep.alt.rationale';
  unit: string;
  values: number[];
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
    labelKey: 'sweep.isl.label',
    tokenKey: 'sweep.isl',
    rationaleKey: 'sweep.isl.rationale',
    unit: 'km',
    values: [2000, 2200, 2400, 2600, 2700, 2750, 2800, 3000],
  },
  {
    parameter: 'min_elevation_deg',
    labelKey: 'sweep.elev.label',
    tokenKey: 'sweep.elev',
    rationaleKey: 'sweep.elev.rationale',
    unit: '°',
    values: [5, 10, 15, 20, 25],
  },
  {
    parameter: 'altitude_km',
    labelKey: 'sweep.alt.label',
    tokenKey: 'sweep.alt',
    rationaleKey: 'sweep.alt.rationale',
    unit: 'km',
    values: [400, 500, 550, 700, 900],
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
