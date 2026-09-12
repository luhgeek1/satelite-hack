import type { CompareResponse } from '@/shared/api';

export interface SiteRow {
  id: string;
  /** Availability as a fraction, in slot order: A, then B. */
  values: [number, number];
  delta: number;
}

/**
 * Worst site first. The target is "не менее 90% для каждого пункта", so the
 * site with the least availability is the one that decides the verdict and it
 * belongs at the top of the chart rather than wherever the alphabet puts it.
 */
export const siteRows = (perClient: CompareResponse['per_client_availability']): SiteRow[] =>
  Object.entries(perClient)
    .map(([id, values]) => {
      const pair: [number, number] = [values[0] ?? 0, values[1] ?? 0];
      return { id, values: pair, delta: pair[1] - pair[0] };
    })
    .sort((left, right) => Math.min(...left.values) - Math.min(...right.values));

/**
 * A 0–100% axis spends its whole range on nothing: these availabilities live in
 * the last few points, and a 1.7 pp gain is invisible at that scale. The window
 * starts one 5-point step below the lowest value drawn — the target included,
 * so the threshold is always on screen.
 */
export const availabilityDomain = (rows: SiteRow[], target: number): [number, number] => {
  const lowest = Math.min(target, ...rows.flatMap((row) => row.values));
  return [Math.max(0, Math.floor(lowest * 20) / 20 - 0.05), 1];
};

/** Ticks on round multiples of the step, so every label is an exact figure. */
export const domainTicks = ([low, high]: [number, number]): number[] => {
  const span = high - low;
  const step = span <= 0.2 ? 0.05 : span <= 0.5 ? 0.1 : 0.25;
  const ticks: number[] = [];
  for (let value = low; value <= high + 1e-9; value += step) {
    ticks.push(Number(value.toFixed(4)));
  }
  return ticks;
};

export const domainPosition = ([low, high]: [number, number], value: number) =>
  ((value - low) / (high - low)) * 100;
