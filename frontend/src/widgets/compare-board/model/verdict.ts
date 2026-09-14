import type { ComparedMetric, Variant } from '@/shared/api';
import type { SiteRow } from './scale';

const valuesOf = (metrics: ComparedMetric[], key: string) =>
  metrics.find((metric) => metric.key === key)?.values;










export const pickWinner = (metrics: ComparedMetric[]): 0 | 1 => {
  const worst = valuesOf(metrics, 'worst_availability');
  if (worst?.[0] != null && worst[1] != null && worst[0] !== worst[1]) {
    return worst[0] > worst[1] ? 0 : 1;
  }

  const outage = valuesOf(metrics, 'max_bounded_outage_s');
  if (outage?.[0] != null && outage[1] != null && outage[0] !== outage[1]) {
    return outage[0] < outage[1] ? 0 : 1;
  }

  return 0;
};


export const sitesBelowTarget = (rows: SiteRow[], slot: 0 | 1, target: number) =>
  rows.filter((row) => row.values[slot] < target).map((row) => row.id);

export interface Recommendation {
  winnerName: string;
  meetsTarget: boolean;
  worstAvailability: number;
  target: number;
  failingSites: string[];



  environmentModified: boolean;
}








export const recommendation = (
  variants: Variant[],
  winner: 0 | 1,
  sites: SiteRow[],
  target: number,
): Recommendation => {
  const winnerVariant = variants[winner];
  return {
    winnerName: winnerVariant.name,
    meetsTarget: winnerVariant.meets_target,
    worstAvailability: winnerVariant.worst_availability,
    target,
    failingSites: sitesBelowTarget(sites, winner, target),
    environmentModified: variants.some((variant) => variant.environment_modified),
  };
};
