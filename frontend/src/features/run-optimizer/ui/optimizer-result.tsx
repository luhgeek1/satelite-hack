'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { formatDegrees, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { OptimizeResult, ScenarioDocument, SimulationConfig } from '@/shared/api';

interface OptimizerResultProps {
  result: OptimizeResult;
  scenario: ScenarioDocument;
  /** The configuration the search ran against, whose angles it moved away from. */
  searchedConfig: SimulationConfig;
  colors: Record<string, string>;
  /** True once the found angles are in the configuration on screen. */
  applied: boolean;
  saving: boolean;
  /**
   * Launch stage the search was scored at, when that is not the stage on
   * screen. Planning a launch judges the finished constellation, so without
   * this the readings below silently describe a different network.
   */
  scoredAtStage: number | null;
  onApply: () => void;
  onSaveAndCompare: (name: string) => void;
  onDismiss: () => void;
}

/**
 * What the search found, in the same corner it ran in.
 *
 * Every reading is stated as a move — the value it had, then the value it would
 * have — so the recommendation can be judged without opening anything else.
 * The card deliberately survives being applied: a search costs tens of seconds,
 * and a result that vanishes the moment it is used leaves nothing on screen to
 * say the configuration is no longer the file.
 */
export function OptimizerResult({
  result,
  scenario,
  searchedConfig,
  colors,
  applied,
  saving,
  scoredAtStage,
  onApply,
  onSaveAndCompare,
  onDismiss,
}: OptimizerResultProps) {
  const { t, formatDuration } = useI18n();
  const suggested = `${scenario.meta.id} · ${t('optimizer.optimizedSuffix')}`;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(suggested);

  const rows = [
    {
      label: t('optimizer.worstAvailability'),
      from: formatPercent(result.baseline.worst_availability),
      to: formatPercent(result.best.worst_availability),
    },
    {
      label: t('optimizer.longestOutage'),
      from: formatDuration(result.baseline.worst_outage_s),
      to: formatDuration(result.best.worst_outage_s),
    },
  ];

  // Where each angle stood when the search started, which is the file's value
  // only until something has been moved by hand or by an earlier search.
  const changes = Object.entries(result.changed_planes).flatMap(([planeId, change]) =>
    (['raan_deg', 'phase_deg'] as const)
      .filter((key) => change[key] !== null)
      .map((key) => {
        const plane = scenario.design.planes.find((item) => item.id === planeId);
        const configured = searchedConfig.planes?.[planeId]?.[key];
        return {
          planeId,
          param: key === 'raan_deg' ? 'RAAN' : 'PHASE',
          from:
            configured
            ?? (key === 'raan_deg' ? (plane?.raan_deg ?? 0) : (plane?.phase_deg ?? 0)),
          to: change[key] as number,
        };
      }),
  );

  return (
    <div className="flex max-h-[min(32rem,74vh)] w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col border border-rule-strong bg-black/90 backdrop-blur">
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-rule px-3 py-2">
        <span className="font-label text-[12px] text-zinc-300">{t('optimizer.title')}</span>
        <div className="flex items-center gap-2.5">
          <span className="font-data text-[10px] tracking-[0.08em] text-zinc-500">
            {applied
              ? t('optimizer.appliedBadge')
              : result.improved
                ? t('optimizer.done')
                : t('optimizer.noGain')}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('optimizer.dismiss')}
            className="text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:outline-none"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-2 border-b border-rule px-3 py-2">
            <span className="font-label text-[12px] text-zinc-400">{row.label}</span>
            <span className="ml-auto font-data text-[11px] tabular-nums text-zinc-600">{row.from}</span>
            <span className="font-data text-[11px] text-zinc-700">&rarr;</span>
            <span className="font-data text-[12px] tabular-nums text-zinc-100">{row.to}</span>
          </div>
        ))}

        {changes.length > 0 && (
          <div className="border-b border-rule px-3 py-2">
            <div className="font-label text-[12px] text-zinc-400">{t('optimizer.orbitChanges')}</div>
            <div className="mt-1.5 space-y-1">
              {changes.map((change) => (
                <div
                  key={`${change.planeId}-${change.param}`}
                  className="flex items-baseline gap-2 font-data text-[11px] tabular-nums"
                >
                  <span
                    className="h-2.5 w-0.5 self-center"
                    style={{ background: colors[change.planeId] ?? '#52525b' }}
                  />
                  <span className="text-zinc-300">{change.planeId}</span>
                  <span className="text-[10px] text-zinc-500">{change.param}</span>
                  <span className="ml-auto text-zinc-600">{formatDegrees(change.from)}</span>
                  <span className="text-zinc-700">&rarr;</span>
                  <span className="text-zinc-100">{formatDegrees(change.to)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {scoredAtStage !== null && (
          <p className="border-b border-rule px-3 py-2 font-label text-[11px] leading-relaxed text-zinc-500">
            {t('optimizer.scoredAt', { stage: scoredAtStage })}
          </p>
        )}

        <p className="px-3 py-2.5 font-label text-[11px] leading-relaxed text-zinc-400">
          {result.verdict}
        </p>
      </div>

      <div className="flex-shrink-0 space-y-2 border-t border-rule p-3">
        {applied ? (
          <div className="flex h-9 w-full items-center justify-center gap-1.5 border border-rule-strong font-label text-[12px] text-zinc-400">
            <Check size={13} />
            {t('optimizer.appliedNote')}
          </div>
        ) : (
          <button
            type="button"
            disabled={!result.improved}
            onClick={onApply}
            className="flex h-9 w-full items-center justify-center border border-zinc-600 font-label text-[12px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300 focus-visible:bg-white/10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            {t('optimizer.apply')}
          </button>
        )}

        {/* Saving is what makes the result durable: the configuration alone is
            one editable thing, and the comparison needs two named ones. */}
        {naming ? (
          <div className="space-y-2">
            <label htmlFor="optimizer-variant-name" className="block font-label text-[11px] text-zinc-400">
              {t('optimizer.nameLabel')}
            </label>
            <input
              id="optimizer-variant-name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim()) onSaveAndCompare(name.trim());
                if (event.key === 'Escape') setNaming(false);
              }}
              className="w-full border border-rule-strong bg-black px-2 py-1.5 font-data text-[11px] text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving || !name.trim()}
                onClick={() => onSaveAndCompare(name.trim())}
                className="flex-1 border border-zinc-600 py-1.5 font-label text-[11px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:outline-none disabled:opacity-40"
              >
                {saving ? t('optimizer.saving') : t('optimizer.saveConfirm')}
              </button>
              <button
                type="button"
                onClick={() => setNaming(false)}
                className="flex-1 border border-rule py-1.5 font-label text-[11px] text-zinc-500 transition-colors hover:border-rule-strong hover:text-zinc-300 focus-visible:outline-none"
              >
                {t('failure.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setName(suggested);
              setNaming(true);
            }}
            className="flex h-8 w-full items-center justify-center border border-rule-strong font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:border-zinc-400 focus-visible:text-zinc-100 focus-visible:outline-none"
          >
            {t('optimizer.saveCompare')}
          </button>
        )}
      </div>
    </div>
  );
}
