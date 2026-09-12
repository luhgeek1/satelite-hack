export type CriticalityTier = 'low' | 'medium' | 'high' | 'critical';

export interface CriticalityLevel {
  /** The tier itself; the words for it live in the dictionary. */
  tier: CriticalityTier;
  color: string;
}

export const criticalityLevel = (value: number): CriticalityLevel => {
  if (value >= 85) return { tier: 'critical', color: '#e4483a' };
  if (value >= 70) return { tier: 'high', color: '#d4d4d8' };
  if (value >= 45) return { tier: 'medium', color: '#8a8a93' };
  return { tier: 'low', color: '#52525b' };
};
