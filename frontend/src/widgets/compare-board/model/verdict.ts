import type { ComparedMetric, Variant } from '@/shared/api';
import type { SiteRow } from './scale';

const valuesOf = (metrics: ComparedMetric[], key: string) =>
  metrics.find((metric) => metric.key === key)?.values;

/**
 * Which slot the comparison favours.
 *
 * The same ranking `_recommend` uses in the compare service: best worst-client
 * availability, ties broken by the shorter longest outage. Python's sort is
 * stable, so an exact tie on both falls through to whichever variant was
 * requested first (slot A) rather than to neither — matched here rather than
 * left as a "nobody wins" state the service does not have.
 */
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

/** The sites that still miss the target under the given slot. */
export const sitesBelowTarget = (rows: SiteRow[], slot: 0 | 1, target: number) =>
  rows.filter((row) => row.values[slot] < target).map((row) => row.id);

export interface Recommendation {
  winnerName: string;
  meetsTarget: boolean;
  worstAvailability: number;
  target: number;
  failingSites: string[];
  /** True when the compared runs do not share one environment — the case
   *  holds altitude, ISL range and elevation mask fixed across design
   *  variants, so tuning any of them makes the pair a sensitivity study. */
  environmentModified: boolean;
}

/**
 * Everything the recommendation sentence needs, read off the winning slot.
 *
 * The compare endpoint already words this sentence itself, but only in
 * English; building it again here from the same figures it used lets the page
 * speak the interface language instead of switching languages mid-sentence.
 */
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
