export type CriticalityLevel = {
  label: 'Low' | 'Medium' | 'High' | 'Critical';
  token: 'LOW' | 'MED' | 'HIGH' | 'CRIT';
  color: string;
};

/**
 * One scale for node criticality, shared by the globe dots, the resilience
 * legend and the satellite detail panel — they used to disagree on thresholds.
 *
 * Severity is carried by brightness rather than by four competing hues, so the
 * scale reads as one ramp and the single alarm colour is spent only on the top
 * band. On the globe the ramp still separates cleanly against dark sky.
 */
export const criticalityLevel = (value: number): CriticalityLevel => {
  if (value >= 85) return { label: 'Critical', token: 'CRIT', color: '#e4483a' };
  if (value >= 70) return { label: 'High', token: 'HIGH', color: '#d9d9de' };
  if (value >= 45) return { label: 'Medium', token: 'MED', color: '#9a9aa3' };
  return { label: 'Low', token: 'LOW', color: '#6b6b72' };
};
