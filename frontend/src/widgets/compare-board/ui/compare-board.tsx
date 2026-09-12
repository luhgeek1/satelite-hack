'use client';

import { useMemo } from 'react';
import { useComparison, useVariants } from '@/entities/variant';
import { useScenarios } from '@/entities/scenario';
import { useSession } from '@/entities/session';
import { useI18n } from '@/shared/i18n';
import { EmptyState, ErrorNote } from '@/shared/ui';
import { TARGET_AVAILABILITY_FALLBACK } from '@/shared/config';
import type { Variant } from '@/shared/api';
import { siteRows } from '../model/scale';
import { MetricStrip } from './metric-strip';
import { SiteComparison } from './site-comparison';
import { VariantColumn } from './variant-column';

export function CompareBoard() {
  const { t } = useI18n();
  const variants = useVariants();
  const scenarios = useScenarios();
  // The pair lives in the session, so arriving here from an optimizer result
  // lands on the right two variants and a tab switch does not clear them.
  const { state, dispatch } = useSession();
  const slots = state.compareSlots;
  const setSlots = (next: [string | null, string | null]) =>
    dispatch({ type: 'setCompareSlots', slots: next });

  const resolved = useMemo(
    () => slots.map((id) => variants.data?.find((variant) => variant.id === id)),
    [slots, variants.data],
  );

  const openVariant = (variant: Variant) =>
    dispatch({
      type: 'openVariant',
      scenarioId: variant.scenario_id as string,
      config: variant.config,
      strategy: variant.strategy,
    });

  const selectedIds = slots.filter((id): id is string => Boolean(id));
  const comparison = useComparison(selectedIds.length === 2 ? selectedIds : []);

  const siteComparison = useMemo(
    () => siteRows(comparison.data?.per_client_availability ?? {}),
    [comparison.data],
  );

  // The threshold belongs to the scenario the variants were saved from, not to
  // this screen; a jury file may set its own.
  const target = useMemo(() => {
    const fromScenario = resolved
      .map((variant) => scenarios.data?.find((item) => item.id === variant?.scenario_id))
      .find((item) => item !== undefined);
    return fromScenario?.target_availability ?? TARGET_AVAILABILITY_FALLBACK;
  }, [resolved, scenarios.data]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-black p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:gap-4">
          <VariantColumn
            slot="A"
            value={resolved[0]}
            exclude={slots[1] ?? undefined}
            onSelect={(id) => setSlots([id, slots[1]])}
            onOpen={openVariant}
          />
          {/* Height-matched to the picker so the divider centres on it and not
              on the whole column. */}
          <div className="flex h-[2.375rem] items-center font-data text-[10px] tracking-[0.08em] text-zinc-600">
            {t('compare.vs')}
          </div>
          <VariantColumn
            slot="B"
            value={resolved[1]}
            exclude={slots[0] ?? undefined}
            lead
            onSelect={(id) => setSlots([slots[0], id])}
            onOpen={openVariant}
          />
        </div>

        {variants.data?.length === 0 && (
          <div className="border border-rule-strong">
            <EmptyState title={t('compare.nothing')} hint={t('compare.nothingHint')} />
          </div>
        )}

        {comparison.isError && <ErrorNote error={comparison.error} />}

        {comparison.data && (
          <>
            <MetricStrip
              metrics={comparison.data.metrics}
              clientCount={Object.keys(comparison.data.per_client_availability).length}
            />

            {comparison.data.changed_parameters.length > 0 && (
              <div className="border border-rule-strong">
                <div className="border-b border-rule px-4 py-2.5 font-label text-[13px] text-zinc-300">
                  {t('compare.changed')}
                </div>
                {comparison.data.changed_parameters.map((diff) => (
                  <div
                    key={diff.path}
                    className="flex items-baseline gap-3 border-b border-rule px-4 py-2 last:border-b-0"
                  >
                    <span className="font-label text-[12px] text-zinc-400">{diff.label}</span>
                    <span className="ml-auto font-data text-[11px] tabular-nums text-zinc-600">
                      {String(diff.values[0] ?? '—')}
                    </span>
                    <span className="font-data text-[11px] text-zinc-700">→</span>
                    <span className="font-data text-[12px] tabular-nums text-zinc-100">
                      {String(diff.values[1] ?? '—')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <SiteComparison
              rows={siteComparison}
              target={target}
              names={[resolved[0]?.name ?? 'A', resolved[1]?.name ?? 'B']}
            />

            <div className="border border-rule-strong p-4 sm:p-5">
              <h3 className="font-label text-[13px] text-zinc-300">{t('compare.recommendation')}</h3>
              <p className="mt-2 font-label text-[12px] leading-relaxed text-zinc-400">
                {comparison.data.recommendation}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
