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
import { pickWinner, sitesBelowTarget } from '../model/verdict';
import { ChangedParameters } from './changed-parameters';
import { MetricStrip } from './metric-strip';
import { SiteComparison } from './site-comparison';
import { VariantBoard } from './variant-board';
import { VariantColumn } from './variant-column';
import { VerdictNote } from './verdict-note';

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

  // Assigning from the standings: the same variant clicked into the slot it
  // already holds clears it, and one clicked into the other slot swaps the two
  // rather than vanishing from the comparison.
  const assign = (slot: 0 | 1, variantId: string) => {
    const next: [string | null, string | null] = [slots[0], slots[1]];
    const other = slot === 0 ? 1 : 0;
    if (next[slot] === variantId) {
      next[slot] = null;
    } else {
      if (next[other] === variantId) next[other] = next[slot];
      next[slot] = variantId;
    }
    setSlots(next);
  };

  const selectedIds = slots.filter((id): id is string => Boolean(id));
  const comparison = useComparison(selectedIds.length === 2 ? selectedIds : []);

  const sites = useMemo(
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

  const names: [string, string] = [resolved[0]?.name ?? 'A', resolved[1]?.name ?? 'B'];
  const winner = comparison.data ? pickWinner(comparison.data.metrics) : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-black p-3 sm:p-4 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-3">
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
            <VerdictNote
              winner={winner}
              names={names}
              below={sitesBelowTarget(sites, winner ?? 1, target)}
              recommendation={comparison.data.recommendation}
            />

            <MetricStrip metrics={comparison.data.metrics} clientCount={sites.length} />

            {/* Evidence on the left, what was moved on the right: the page
                stops being one tall column of half-empty panels. */}
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <SiteComparison rows={sites} target={target} names={names} />
              <ChangedParameters diffs={comparison.data.changed_parameters} />
            </div>
          </>
        )}

        {variants.data && variants.data.length > 0 && (
          <VariantBoard
            variants={variants.data}
            slots={slots}
            hint={comparison.data ? undefined : t('compare.pickTwo')}
            onAssign={assign}
          />
        )}
      </div>
    </div>
  );
}
