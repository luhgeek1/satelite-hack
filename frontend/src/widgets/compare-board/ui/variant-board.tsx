'use client';

import { cn, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { Variant } from '@/shared/api';

interface VariantBoardProps {
  variants: Variant[];
  slots: [string | null, string | null];
  /** Shown above the table while the pair is still incomplete. */
  hint?: string;
  onAssign: (slot: 0 | 1, variantId: string) => void;
}

const SLOTS = [0, 1] as const;

/**
 * Everything saved so far, ranked by the figure the target is judged on, with
 * the compared pair marked in place. Two dropdowns hide how a variant stands
 * against the rest of the work; this is the standings, and each row is one
 * click away from being compared.
 */
export function VariantBoard({ variants, slots, hint, onAssign }: VariantBoardProps) {
  const { t, formatDuration } = useI18n();
  const ranked = [...variants].sort((left, right) => right.worst_availability - left.worst_availability);

  return (
    <div className="border border-rule-strong">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule px-3 py-2">
        <h3 className="font-label text-[13px] text-zinc-300">{t('compare.saved')}</h3>
        {hint && <span className="font-label text-[11px] text-zinc-500">{hint}</span>}
        <span className="ml-auto font-data text-[10px] tabular-nums text-zinc-600">{variants.length}</span>
      </div>

      <div className="flex items-center gap-3 border-b border-rule px-3 py-1 font-label text-[10px] tracking-[0.04em] text-zinc-600">
        <span className="w-[2.4rem] flex-shrink-0" />
        <span className="min-w-0 flex-1">{t('compare.colVariant')}</span>
        <span className="hidden w-28 truncate md:block">{t('compare.colScenario')}</span>
        <span className="w-14 flex-shrink-0 text-right">{t('compare.colWorst')}</span>
        <span className="hidden w-14 flex-shrink-0 text-right sm:block">{t('compare.colMean')}</span>
        <span className="hidden w-16 flex-shrink-0 text-right md:block">{t('compare.colOutage')}</span>
      </div>

      {ranked.map((variant) => {
        const slot = SLOTS.find((index) => slots[index] === variant.id);

        return (
          <div
            key={variant.id}
            className={cn(
              'flex items-center gap-3 border-b border-rule px-3 py-1.5 transition-colors last:border-b-0',
              slot === undefined ? 'hover:bg-white/[0.03]' : 'bg-white/[0.04]',
            )}
          >
            <div className="flex flex-shrink-0 gap-px">
              {SLOTS.map((index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onAssign(index, variant.id)}
                  aria-pressed={slot === index}
                  aria-label={t('compare.assign', { slot: index === 0 ? 'A' : 'B', name: variant.name })}
                  className={cn(
                    'h-[17px] w-[17px] border font-data text-[9.5px] leading-none transition-colors',
                    slot === index
                      ? 'border-zinc-300 text-zinc-100'
                      : 'border-rule-strong text-zinc-700 hover:border-zinc-600 hover:text-zinc-300',
                  )}
                >
                  {index === 0 ? 'A' : 'B'}
                </button>
              ))}
            </div>

            <span
              className={cn(
                'min-w-0 flex-1 truncate font-label text-[12px]',
                slot === undefined ? 'text-zinc-400' : 'text-zinc-100',
              )}
            >
              {variant.name}
            </span>

            <span className="hidden w-28 truncate font-data text-[10px] text-zinc-600 md:block">
              {variant.scenario_title}
            </span>

            <span
              className={cn(
                'w-14 flex-shrink-0 text-right font-data text-[11px] tabular-nums',
                variant.meets_target ? 'text-zinc-200' : 'text-alarm',
              )}
            >
              {formatPercent(variant.worst_availability)}
            </span>

            <span className="hidden w-14 flex-shrink-0 text-right font-data text-[11px] tabular-nums text-zinc-500 sm:block">
              {formatPercent(variant.mean_availability)}
            </span>

            <span className="hidden w-16 flex-shrink-0 text-right font-data text-[11px] tabular-nums text-zinc-500 md:block">
              {formatDuration(variant.max_bounded_outage_s)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
