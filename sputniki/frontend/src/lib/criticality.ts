export type CriticalityLevel = {
  label: 'Low' | 'Medium' | 'High' | 'Critical';
  color: string;
};

/**
 * One scale for node criticality, shared by the globe dots, the resilience
 * legend and the satellite detail panel — they used to disagree on thresholds.
 */
export const criticalityLevel = (value: number): CriticalityLevel => {
  if (value >= 85) return { label: 'Critical', color: '#ef4444' };
  if (value >= 70) return { label: 'High', color: '#f97316' };
  if (value >= 45) return { label: 'Medium', color: '#fbbf24' };
  return { label: 'Low', color: '#71717a' };
};
