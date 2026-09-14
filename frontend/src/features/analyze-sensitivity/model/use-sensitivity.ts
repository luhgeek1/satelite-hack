'use client';

import { useQueries } from '@tanstack/react-query';
import { analysisApi, queryKeys } from '@/shared/api';
import { normalizeConfig, type RunInput } from '@/entities/simulation';

export type SweepParameter = 'isl_range_km' | 'min_elevation_deg' | 'altitude_km';

export interface SweepSpec {
  parameter: SweepParameter;

  labelKey: 'sweep.isl.label' | 'sweep.elev.label' | 'sweep.alt.label';
  tokenKey: 'sweep.isl' | 'sweep.elev' | 'sweep.alt';
  rationaleKey: 'sweep.isl.rationale' | 'sweep.elev.rationale' | 'sweep.alt.rationale';
  unit: string;
  values: number[];
}







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










export function useSensitivitySweeps(input: RunInput, enabled: boolean) {
  const config = normalizeConfig(input.config);
  const key = { scenarioId: input.scenarioId, config, strategy: input.strategy };

  return useQueries({
    queries: SWEEPS.map((spec) => ({
      queryKey: queryKeys.sensitivity(key, spec.parameter, spec.values),
      queryFn: () =>
        analysisApi.sensitivity({
          scenario_id: input.scenarioId as string,
          config,
          strategy: input.strategy,
          parameter: spec.parameter,
          values: spec.values,
        }),
      enabled: enabled && Boolean(input.scenarioId),
      staleTime: Infinity,
      gcTime: 15 * 60_000,
    })),
  });
}
