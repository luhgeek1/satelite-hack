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

/** A loss this small is below what a day of two-minute steps can tell apart. */
const NOTICEABLE_DROP = 0.0025;
/** A point of availability: the loss an operator would act on. */
const SERIOUS_DROP = 0.01;

/**
 * The 0…100 score, on an absolute scale.
 *
 * The service scores each satellite against the worst one in the same run, so
 * the most important satellite of a healthy constellation always reads 100 and
 * red — which is how a loss of two points, with the target still met, was being
 * shown as critical across the whole globe. Here the tiers mean something fixed:
 * critical only when the loss alone breaks the target, high from one point of
 * availability, medium from a quarter of one, and low below that.
 */
export const criticalityFromImpact = (drop: number, breaksTarget: boolean): number => {
  const loss = Math.max(0, drop);

  if (breaksTarget) return Math.min(100, 85 + loss * 100);
  if (loss >= SERIOUS_DROP) return Math.min(84, 70 + ((loss - SERIOUS_DROP) / 0.04) * 14);
  if (loss >= NOTICEABLE_DROP) {
    return 45 + ((loss - NOTICEABLE_DROP) / (SERIOUS_DROP - NOTICEABLE_DROP)) * 24;
  }
  return (loss / NOTICEABLE_DROP) * 44;
};
