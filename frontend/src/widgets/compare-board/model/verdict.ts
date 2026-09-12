import type { ComparedMetric } from '@/shared/api';
import type { SiteRow } from './scale';

const valuesOf = (metrics: ComparedMetric[], key: string) =>
  metrics.find((metric) => metric.key === key)?.values;

/**
 * Which slot the comparison favours, or null when nothing separates them.
 *
 * The same ranking the compare service uses for its sentence — best
 * worst-client availability, ties broken by the shorter longest outage — so
 * the headline above that sentence cannot disagree with it.
 */
export const pickWinner = (metrics: ComparedMetric[]): 0 | 1 | null => {
  const worst = valuesOf(metrics, 'worst_availability');
  if (worst?.[0] != null && worst[1] != null && worst[0] !== worst[1]) {
    return worst[0] > worst[1] ? 0 : 1;
  }

  const outage = valuesOf(metrics, 'max_bounded_outage_s');
  if (outage?.[0] != null && outage[1] != null && outage[0] !== outage[1]) {
    return outage[0] < outage[1] ? 0 : 1;
  }

  return null;
};

/** The sites that still miss the target under the given slot. */
export const sitesBelowTarget = (rows: SiteRow[], slot: 0 | 1, target: number) =>
  rows.filter((row) => row.values[slot] < target).map((row) => row.id);
