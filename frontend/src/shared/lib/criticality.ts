export interface CriticalityLevel {
  label: 'Low' | 'Medium' | 'High' | 'Critical';
  token: string;
  color: string;
}

export const criticalityLevel = (value: number): CriticalityLevel => {
  if (value >= 85) return { label: 'Critical', token: 'CRIT', color: '#e4483a' };
  if (value >= 70) return { label: 'High', token: 'HIGH', color: '#d4d4d8' };
  if (value >= 45) return { label: 'Medium', token: 'MED', color: '#8a8a93' };
  return { label: 'Low', token: 'LOW', color: '#52525b' };
};
