'use client';

import { cn, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { Recommendation } from '../model/verdict';

interface VerdictNoteProps {
  recommendation: Recommendation;
}

/**
 * The answer, first: which variant is ahead, whether it clears the target,
 * and why — built from the same figures the compare endpoint's own sentence
 * uses, so the page can say it in the interface language instead of switching
 * to English mid-sentence for one paragraph.
 */
export function VerdictNote({ recommendation: reco }: VerdictNoteProps) {
  const { t } = useI18n();
  const clear = reco.meetsTarget;
  const worst = formatPercent(reco.worstAvailability);
  const target = formatPercent(reco.target, 0);

  const body = clear
    ? t('compare.recoMeets', { name: reco.winnerName, target, worst })
    : t('compare.recoMisses', { name: reco.winnerName, target, worst, sites: reco.failingSites.join(', ') });

  return (
    <div
      className={cn(
        'border border-rule-strong border-l-2 px-3 py-2.5',
        clear ? 'border-l-zinc-100' : 'border-l-alarm',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-label text-[13px] text-zinc-100">
          {t('compare.leads', { name: reco.winnerName })}
        </span>
        <span className={cn('font-label text-[11px]', clear ? 'text-zinc-500' : 'text-alarm')}>
          {clear ? t('compare.allMeet') : t('compare.belowTarget', { sites: reco.failingSites.join(', ') })}
        </span>
      </div>
      <p className="mt-1.5 font-label text-[12px] leading-relaxed text-zinc-500">
        {body}
        {reco.environmentModified && ` ${t('compare.recoCaveat')}`}
      </p>
    </div>
  );
}
