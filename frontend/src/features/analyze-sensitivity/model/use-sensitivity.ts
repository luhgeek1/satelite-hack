'use client';

import { useQueries } from '@tanstack/react-query';
import { analysisApi, queryKeys } from '@/shared/api';
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

/**
 * All three sweeps, each cached on its own.
 *
 * One mutation used to serve every parameter, so switching from link range to
 * altitude kept drawing the link-range points under the altitude label until
 * somebody pressed the button again. Each sweep is now a query of its own, keyed
 * by the configuration, and they start by themselves: three seconds apiece on
 * the production machine is cheap enough to have the answer waiting.
 */
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
