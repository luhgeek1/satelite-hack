export type CriticalityTier = 'low' | 'medium' | 'high' | 'critical';

export interface CriticalityLevel {

  tier: CriticalityTier;
  color: string;
}

export const criticalityLevel = (value: number): CriticalityLevel => {
  if (value >= 85) return { tier: 'critical', color: '#e4483a' };
  if (value >= 70) return { tier: 'high', color: '#d4d4d8' };
  if (value >= 45) return { tier: 'medium', color: '#8a8a93' };
  return { tier: 'low', color: '#52525b' };
};


const NOTICEABLE_DROP = 0.0025;

const SERIOUS_DROP = 0.01;











export const criticalityFromImpact = (drop: number, breaksTarget: boolean): number => {
  const loss = Math.max(0, drop);

  if (breaksTarget) return Math.min(100, 85 + loss * 100);
  if (loss >= SERIOUS_DROP) return Math.min(84, 70 + ((loss - SERIOUS_DROP) / 0.04) * 14);
  if (loss >= NOTICEABLE_DROP) {
    return 45 + ((loss - NOTICEABLE_DROP) / (SERIOUS_DROP - NOTICEABLE_DROP)) * 24;
  }
  return (loss / NOTICEABLE_DROP) * 44;
};
