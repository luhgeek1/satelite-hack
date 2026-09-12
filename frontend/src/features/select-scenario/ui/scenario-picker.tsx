'use client';

import { useRef, useState } from 'react';
import { ChevronDown, Trash2, Upload } from 'lucide-react';
import { useDeleteScenario, useImportScenario, useScenarios } from '@/entities/scenario';
import { useDeleteVariant, useVariants } from '@/entities/variant';
import { hasConfigChanges } from '@/entities/simulation';
import { useSession } from '@/entities/session';
import { cn, formatPercent } from '@/shared/lib';
import { ErrorNote } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument } from '@/shared/api';

export function ScenarioPicker() {
  const { state, dispatch } = useSession();
  const { t } = useI18n();
  const scenarios = useScenarios();
  const variants = useVariants();
  const importScenario = useImportScenario();
  const deleteScenario = useDeleteScenario();
  const deleteVariant = useDeleteVariant();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const active = scenarios.data?.find((scenario) => scenario.id === state.scenarioId);
  // The name alone stops being true the moment a slider moves, and an
  // optimizer pass leaves no other mark on the header at all.
  const modified = hasConfigChanges(state.config, state.strategy);

  const handleFile = async (file: File) => {
    setReadError(null);
    try {
      const document = JSON.parse(await file.text()) as ScenarioDocument;
      const created = await importScenario.mutateAsync(document);
      dispatch({ type: 'selectScenario', scenarioId: created.id });
    } catch (error) {
      if (error instanceof SyntaxError) setReadError(t('scenario.badJson'));
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex h-9 items-center gap-2 border border-rule-strong px-2.5 font-data text-[12px] text-zinc-200 transition-colors hover:border-zinc-600 focus-visible:border-zinc-400 focus-visible:outline-none"
        >
          <span className="max-w-[11rem] truncate">{active?.id ?? t('scenario.select')}</span>
          {modified && (
            <span className="flex-shrink-0 border border-zinc-600 px-1 font-data text-[9px] tracking-[0.08em] text-zinc-300">
              {t('changes.badge')}
            </span>
          )}
          <ChevronDown size={12} className="text-zinc-500" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 max-h-[60vh] w-[18rem] overflow-y-auto border border-rule-strong bg-black">
              <div className="border-b border-rule px-3 py-1.5 font-data text-[9px] tracking-[0.08em] text-zinc-600">
                {t('scenario.files')}
              </div>
              {scenarios.data?.map((scenario) => (
                <div
                  key={scenario.id}
                  className={cn(
                    'flex items-stretch border-b border-rule transition-colors last:border-b-0 hover:bg-white/[0.04]',
                    scenario.id === state.scenarioId && 'bg-white/[0.06]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'selectScenario', scenarioId: scenario.id });
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-data text-[12px] text-zinc-100">{scenario.id}</span>
                      <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-zinc-600">
                        {scenario.source === 'official' ? t('scenario.case') : t('scenario.import')}
                      </span>
                    </span>
                    <span className="truncate font-label text-[11px] text-zinc-500">{scenario.title}</span>
                    <span className="font-data text-[10px] tabular-nums text-zinc-600">
                      {scenario.satellite_count} SV · {scenario.client_count} CL · {scenario.steps} steps
                    </span>
                  </button>
                  {scenario.source !== 'official' && (
                    <button
                      type="button"
                      onClick={() => deleteScenario.mutate(scenario.id)}
                      aria-label={t('scenario.delete', { name: scenario.id })}
                      className="flex-shrink-0 px-3 text-zinc-600 transition-colors hover:text-alarm"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}

              {/* A saved variant is a scenario plus a configuration. Opening one
                  restores both, which is the only way back to a search result
                  once the panel has been touched. */}
              <div className="border-y border-rule bg-white/[0.02] px-3 py-1.5 font-data text-[9px] tracking-[0.08em] text-zinc-600">
                {t('scenario.variants')}
              </div>
              {variants.data?.length ? (
                variants.data.map((variant) => (
                  <div
                    key={variant.id}
                    className="flex items-stretch border-b border-rule transition-colors last:border-b-0 hover:bg-white/[0.04]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!variant.scenario_id) return;
                        dispatch({
                          type: 'openVariant',
                          scenarioId: variant.scenario_id,
                          config: variant.config,
                          strategy: variant.strategy,
                        });
                        setOpen(false);
                      }}
                      disabled={!variant.scenario_id}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left disabled:opacity-40"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-data text-[12px] text-zinc-100">{variant.name}</span>
                        <span className="ml-auto shrink-0 font-data text-[9px] tracking-[0.08em] text-zinc-600">
                          {t('scenario.variant')}
                        </span>
                      </span>
                      <span className="font-data text-[10px] tabular-nums text-zinc-500">
                        {formatPercent(variant.worst_availability)} · {variant.scenario_id}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteVariant.mutate(variant.id)}
                      aria-label={t('scenario.delete', { name: variant.name })}
                      className="flex-shrink-0 px-3 text-zinc-600 transition-colors hover:text-alarm"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-3 py-2 font-label text-[11px] text-zinc-600">
                  {t('scenario.noVariants')}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={importScenario.isPending}
        className="flex h-9 items-center gap-1.5 border border-rule-strong px-2.5 font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:border-zinc-400 focus-visible:outline-none disabled:opacity-50"
      >
        <Upload size={13} />
        <span className="hidden sm:inline">JSON</span>
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = '';
        }}
      />

      {(readError || importScenario.isError) && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[20rem]">
          {readError ? (
            <div className="border border-alarm/40 bg-alarm/5 px-3 py-2 font-label text-[12px] text-alarm">
              {readError}
            </div>
          ) : (
            <ErrorNote error={importScenario.error} />
          )}
        </div>
      )}
    </div>
  );
}
