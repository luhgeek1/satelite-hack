import type { CompareResponse } from '@/shared/api';

export interface SiteRow {
  id: string;

  values: [number, number];
  delta: number;
}






export const siteRows = (perClient: CompareResponse['per_client_availability']): SiteRow[] =>
  Object.entries(perClient)
    .map(([id, values]) => {
      const pair: [number, number] = [values[0] ?? 0, values[1] ?? 0];
      return { id, values: pair, delta: pair[1] - pair[0] };
    })
    .sort((left, right) => Math.min(...left.values) - Math.min(...right.values));












export const availabilityDomain = (rows: SiteRow[]): [number, number] => {
  const lowest = Math.min(1, ...rows.flatMap((row) => row.values));
  return [Math.max(0, Math.floor(lowest * 20) / 20 - 0.05), 1];
};


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
