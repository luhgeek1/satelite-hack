'use client';

import { useRef, useState } from 'react';
import { ChevronDown, Upload } from 'lucide-react';
import { useImportScenario, useScenarios } from '@/entities/scenario';
import { useSession } from '@/entities/session';
import { cn } from '@/shared/lib';
import { ErrorNote } from '@/shared/ui';
import type { ScenarioDocument } from '@/shared/api';

export function ScenarioPicker() {
  const { state, dispatch } = useSession();
  const scenarios = useScenarios();
  const importScenario = useImportScenario();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const active = scenarios.data?.find((scenario) => scenario.id === state.scenarioId);

  const handleFile = async (file: File) => {
    setReadError(null);
    try {
      const document = JSON.parse(await file.text()) as ScenarioDocument;
      const created = await importScenario.mutateAsync(document);
      dispatch({ type: 'selectScenario', scenarioId: created.id });
    } catch (error) {
      if (error instanceof SyntaxError) setReadError('That file is not valid JSON');
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
          <span className="max-w-[11rem] truncate">{active?.id ?? 'Select scenario'}</span>
          <ChevronDown size={12} className="text-zinc-500" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 max-h-[60vh] w-[18rem] overflow-y-auto border border-rule-strong bg-black">
              {scenarios.data?.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'selectScenario', scenarioId: scenario.id });
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-rule px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-white/[0.04]',
                    scenario.id === state.scenarioId && 'bg-white/[0.06]',
                  )}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="font-data text-[12px] text-zinc-100">{scenario.id}</span>
                    <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-zinc-600">
                      {scenario.source === 'official' ? 'CASE' : 'IMPORT'}
                    </span>
                  </span>
                  <span className="truncate font-label text-[11px] text-zinc-500">{scenario.title}</span>
                  <span className="font-data text-[10px] tabular-nums text-zinc-600">
                    {scenario.satellite_count} SV · {scenario.client_count} CL · {scenario.steps} steps
                  </span>
                </button>
              ))}
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
