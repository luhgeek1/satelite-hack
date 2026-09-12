'use client';

import { VariantSelect } from '@/features/manage-variants';
import { useI18n } from '@/shared/i18n';
import type { Variant } from '@/shared/api';

interface VariantColumnProps {
  slot: string;
  value: Variant | undefined;
  exclude: string | undefined;
  lead?: boolean;
  onSelect: (variantId: string) => void;
  onOpen: (variant: Variant) => void;
}

/**
 * One side of the comparison: the picker, and under it — in the same column,
 * at the same width — the way back into the simulation. The two controls read
 * as one stack, so which variant a button belongs to is never in doubt.
 */
export function VariantColumn({ slot, value, exclude, lead, onSelect, onOpen }: VariantColumnProps) {
  const { t } = useI18n();

  return (
    <div className="min-w-0">
      <VariantSelect slot={slot} value={value} exclude={exclude} lead={lead} onSelect={onSelect} />

      {/* A comparison answers "which one", and the next thing the engineer
          wants is that one loaded back into the simulation. */}
      {value?.scenario_id && (
        <button
          type="button"
          onClick={() => onOpen(value)}
          className="mt-1.5 w-full border border-rule-strong py-1.5 font-label text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none"
        >
          {t('compare.open')}
        </button>
      )}

      {value && (
        <div className="mt-1.5 truncate font-data text-[10px] text-zinc-600">
          {value.scenario_title} · {value.strategy}
        </div>
      )}
    </div>
  );
}
