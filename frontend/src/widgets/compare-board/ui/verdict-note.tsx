'use client';

import { cn } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';

interface VerdictNoteProps {
  /** Slot the comparison favours, or null when nothing separates the two. */
  winner: 0 | 1 | null;
  names: [string, string];
  below: string[];
  recommendation: string;
}

/**
 * The answer, first: which variant is ahead and whether it clears the target.
 * The service's sentence follows as the reasoning — it is worded in English by
 * the backend, so the headline above it carries the verdict in the user's
 * language.
 */
export function VerdictNote({ winner, names, below, recommendation }: VerdictNoteProps) {
  const { t } = useI18n();
  const clear = below.length === 0;

  return (
    <div
      className={cn(
        'border border-rule-strong border-l-2 px-3 py-2.5',
        winner === null ? 'border-l-zinc-600' : clear ? 'border-l-zinc-100' : 'border-l-alarm',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-label text-[13px] text-zinc-100">
          {winner === null ? t('compare.tied') : t('compare.leads', { name: names[winner] })}
        </span>
        <span className={cn('font-label text-[11px]', clear ? 'text-zinc-500' : 'text-alarm')}>
          {clear ? t('compare.allMeet') : t('compare.belowTarget', { sites: below.join(', ') })}
        </span>
      </div>
      <p className="mt-1.5 font-label text-[12px] leading-relaxed text-zinc-500">{recommendation}</p>
    </div>
  );
}
