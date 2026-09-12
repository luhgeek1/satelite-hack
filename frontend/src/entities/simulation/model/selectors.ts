import type { AvailabilitySample, ClientMetrics, SimulationSummary } from '@/shared/api';

export const clientsOf = (summary: SimulationSummary | undefined): ClientMetrics[] =>
  summary?.clients ?? [];

export const availabilityByClient = (summary: SimulationSummary | undefined): Record<string, number> =>
  Object.fromEntries(clientsOf(summary).map((client) => [client.client_id, client.availability]));

export const worstClient = (summary: SimulationSummary | undefined): ClientMetrics | undefined =>
  clientsOf(summary).reduce<ClientMetrics | undefined>(
    (worst, client) => (!worst || client.availability < worst.availability ? client : worst),
    undefined,
  );

export const longestOutageS = (summary: SimulationSummary | undefined): number =>
  clientsOf(summary).reduce((longest, client) => Math.max(longest, client.max_outage_s), 0);

export interface OutageBand {
  clientId: string;
  startFraction: number;
  widthFraction: number;
  state: 'visible_no_route' | 'no_satellite';
}

export function outageBands(
  series: AvailabilitySample[] | undefined,
  horizonS: number,
  stepS: number,
): OutageBand[] {
  if (!series?.length) return [];

  const bands: OutageBand[] = [];
  const clientIds = Object.keys(series[0].state);

  for (const clientId of clientIds) {
    let runStart: number | null = null;
    let runState: OutageBand['state'] = 'visible_no_route';

    const flush = (endIndex: number) => {
      if (runStart === null) return;
      const startS = series[runStart].t_s;
      const endS = series[endIndex - 1].t_s + stepS;
      bands.push({
        clientId,
        startFraction: startS / horizonS,
        widthFraction: (endS - startS) / horizonS,
        state: runState,
      });
      runStart = null;
    };

    series.forEach((sample, index) => {
      const state = sample.state[clientId];
      if (state === 'routed') {
        flush(index);
        return;
      }
      if (runStart === null) {
        runStart = index;
        runState = state;
      } else if (state !== runState) {
        flush(index);
        runStart = index;
        runState = state;
      }
    });

    flush(series.length);
  }

  return bands;
}
