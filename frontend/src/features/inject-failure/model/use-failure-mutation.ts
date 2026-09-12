'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  simulationsApi,
  type FailureDto,
  type SimulationSummary,
  type SnapshotResponse,
} from '@/shared/api';
import { normalizeConfig } from '@/entities/simulation';
import { useSession } from '@/entities/session';
import { snapshotWithoutSatellite } from './predict';

interface Context {
  snapshotKey: readonly unknown[];
  previousSnapshot: SnapshotResponse | undefined;
}

export interface FailureRequest {
  satelliteId: string;
  startS?: number;
  endS?: number;
}

/**
 * `tS` is the timeline position and doubles as the default outage start: the
 * flow the organisers described is "go to a moment, fail a satellite, watch
 * the route rebuild", so a one-click failure begins where the engineer is
 * looking rather than at midnight. The form still offers the whole day.
 */
export function useInjectFailure(runId: string | undefined, tS: number, horizonS: number) {
  const queryClient = useQueryClient();
  const { state, dispatch } = useSession();

  return useMutation<SimulationSummary, Error, FailureRequest, Context>({
    mutationFn: ({ satelliteId, startS = tS, endS = horizonS }) => {
      const failure: FailureDto = { satellite_id: satelliteId, start_s: startS, end_s: endS };
      // Windows that do not overlap this one survive: the same node can be
      // taken down over several spans of the day.
      const failures = [
        ...(state.config.failures ?? []).filter(
          (item) =>
            item.satellite_id !== satelliteId || item.start_s >= endS || item.end_s <= startS,
        ),
        failure,
      ];

      return simulationsApi.run({
        scenario_id: state.scenarioId as string,
        config: normalizeConfig({ ...state.config, failures }),
        strategy: state.strategy,
      });
    },

    onMutate: async ({ satelliteId, startS = tS, endS = horizonS }) => {
      const snapshotKey = queryKeys.snapshot(runId ?? '', tS);
      await queryClient.cancelQueries({ queryKey: snapshotKey });

      const previousSnapshot = queryClient.getQueryData<SnapshotResponse>(snapshotKey);

      // Only predict the visible state when the outage actually covers the
      // instant on screen; a window starting later must not blank the node now.
      if (startS <= tS && tS < endS) {
        queryClient.setQueryData<SnapshotResponse | undefined>(snapshotKey, (current) =>
          snapshotWithoutSatellite(current, satelliteId),
        );
      }

      dispatch({
        type: 'addFailure',
        failure: { satellite_id: satelliteId, start_s: startS, end_s: endS },
      });

      return { snapshotKey, previousSnapshot };
    },

    onError: (_error, { satelliteId, startS = tS, endS = horizonS }, context) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(context.snapshotKey, context.previousSnapshot);
      }
      // Only the window this call added; the node's other outages were not ours
      // to roll back.
      dispatch({ type: 'removeFailure', satelliteId, window: { startS, endS } });
    },

    onSuccess: (summary) => {
      queryClient.setQueryData(
        queryKeys.simulation({
          scenarioId: state.scenarioId,
          config: normalizeConfig(summary.config),
          strategy: summary.strategy,
        }),
        summary,
      );
    },
  });
}

export function useRestoreSatellite() {
  const { dispatch } = useSession();
  return (satelliteId: string) => dispatch({ type: 'removeFailure', satelliteId });
}
