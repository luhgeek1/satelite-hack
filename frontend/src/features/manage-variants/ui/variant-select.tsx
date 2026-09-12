'use client';

import { ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDeleteVariant, useVariants } from '@/entities/variant';
import { cn, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { Variant } from '@/shared/api';

interface VariantSelectProps {
  slot: string;
  value: Variant | undefined;
  exclude: string | undefined;
  lead?: boolean;
  onSelect: (variantId: string) => void;
}

export function VariantSelect({ slot, value, exclude, lead, onSelect }: VariantSelectProps) {
  const { t } = useI18n();
  const variants = useVariants();
  const deleteVariant = useDeleteVariant();
  const [open, setOpen] = useState(false);

  const options = (variants.data ?? []).filter((variant) => variant.id !== exclude);

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors focus-visible:outline-none',
          lead
            ? 'border-zinc-600 hover:border-zinc-400 focus-visible:border-zinc-300'
            : 'border-rule-strong hover:border-zinc-600 focus-visible:border-zinc-400',
        )}
      >
        <span className={cn('font-data text-[11px]', lead ? 'text-zinc-300' : 'text-zinc-500')}>{slot}</span>
        <span
          className={cn(
            'truncate font-label text-[13px]',
            value ? (lead ? 'text-zinc-100' : 'text-zinc-300') : 'text-zinc-600',
          )}
        >
          {value?.name ?? t('compare.pick')}
        </span>
        {value && (
          <span className="ml-auto font-data text-[11px] tabular-nums text-zinc-500">
            {formatPercent(value.worst_availability)}
          </span>
        )}
        <ChevronDown size={13} className="ml-auto flex-shrink-0 text-zinc-600" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[50vh] overflow-y-auto border border-rule-strong bg-black">
            {options.length === 0 && (
              <div className="px-3 py-3 font-label text-[11px] text-zinc-500">
                No saved variants yet. Configure the network and save one from the Simulation tab.
              </div>
            )}
            {options.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center border-b border-rule last:border-b-0 hover:bg-white/[0.04]"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(variant.id);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left"
                >
                  <span className="truncate font-label text-[12px] text-zinc-200">{variant.name}</span>
                  <span className="font-data text-[10px] tabular-nums text-zinc-500">
                    worst {formatPercent(variant.worst_availability)} · {variant.strategy}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteVariant.mutate(variant.id)}
                  aria-label={t('compare.delete', { name: variant.name })}
                  className="px-3 text-zinc-600 transition-colors hover:text-alarm"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
