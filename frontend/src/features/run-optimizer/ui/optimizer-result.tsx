'use client';

import { X } from 'lucide-react';
import { formatDegrees, formatDuration, formatPercent } from '@/shared/lib';
import type { OptimizeResult, ScenarioDocument } from '@/shared/api';

interface OptimizerResultProps {
  result: OptimizeResult;
  scenario: ScenarioDocument;
  colors: Record<string, string>;
  onApply: () => void;
  onCompare: () => void;
  onDismiss: () => void;
}

/**
 * What the search found, in the same corner it ran in. Every reading is stated
 * as a move — the value it had, then the value it would have — so the
 * recommendation can be judged without opening anything else.
 */
export function OptimizerResult({
  result,
  scenario,
  colors,
  onApply,
  onCompare,
  onDismiss,
}: OptimizerResultProps) {
  const rows = [
    {
      label: 'Worst availability',
      from: formatPercent(result.baseline.worst_availability),
      to: formatPercent(result.best.worst_availability),
    },
    {
      label: 'Longest outage',
      from: formatDuration(result.baseline.worst_outage_s),
      to: formatDuration(result.best.worst_outage_s),
    },
  ];

  const changes = Object.entries(result.changed_planes).flatMap(([planeId, change]) =>
    (['raan_deg', 'phase_deg'] as const)
      .filter((key) => change[key] !== null)
      .map((key) => {
        const plane = scenario.design.planes.find((item) => item.id === planeId);
        return {
          planeId,
          param: key === 'raan_deg' ? 'RAAN' : 'PHASE',
          from: key === 'raan_deg' ? (plane?.raan_deg ?? 0) : (plane?.phase_deg ?? 0),
          to: change[key] as number,
        };
      }),
  );

  return (
    <div className="flex max-h-[min(30rem,70vh)] w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col border border-rule-strong bg-black/90 backdrop-blur">
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-rule px-3 py-2">
        <span className="font-label text-[12px] text-zinc-300">Optimizer</span>
        <div className="flex items-center gap-2.5">
          <span className="font-data text-[10px] tracking-[0.08em] text-zinc-500">
            {result.improved ? 'DONE' : 'NO GAIN'}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss recommendation"
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
            <div className="font-label text-[12px] text-zinc-400">Orbit changes</div>
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

        <p className="px-3 py-2.5 font-label text-[11px] leading-relaxed text-zinc-400">
          {result.verdict}
        </p>
      </div>

      <div className="flex-shrink-0 space-y-2 border-t border-rule p-3">
        <button
          type="button"
          disabled={!result.improved}
          onClick={onApply}
          className="flex h-9 w-full items-center justify-center border border-zinc-600 font-label text-[12px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300 focus-visible:bg-white/10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
        >
          Apply configuration
        </button>
        <button
          type="button"
          onClick={onCompare}
          className="flex h-8 w-full items-center justify-center border border-rule-strong font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:border-zinc-400 focus-visible:text-zinc-100 focus-visible:outline-none"
        >
          Compare saved variants
        </button>
      </div>
    </div>
  );
}
