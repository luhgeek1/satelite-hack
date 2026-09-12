'use client';

import { useState } from 'react';
import { Lock, LockOpen, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { SensitivityPanel } from '@/features/analyze-sensitivity';
import { useOptimizer, type PlaneLock } from '@/features/run-optimizer';
import { useSession } from '@/entities/session';
import type { RunInput } from '@/entities/simulation';
import { cn, criticalityLevel, formatDegrees, formatDuration, formatPercent } from '@/shared/lib';
import { EmptyState, ErrorNote, IndeterminateBar, ProgressBar } from '@/shared/ui';
import type { GatewayDependency, ResilienceResponse, ScenarioDocument } from '@/shared/api';

interface CriticalNodesProps {
  scenario: ScenarioDocument;
  resilience: ResilienceResponse | undefined;
  loading: boolean;
  error: unknown;
  colors: Record<string, string>;
  runInput: RunInput;
}

export function CriticalNodes({
  scenario,
  resilience,
  loading,
  error,
  colors,
  runInput,
}: CriticalNodesProps) {
  const { state, dispatch } = useSession();
  const optimizer = useOptimizer(runInput);
  const [locks, setLocks] = useState<PlaneLock[]>(
    scenario.design.planes.map((plane) => ({
      planeId: plane.id,
      raanLocked: false,
      phaseLocked: false,
    })),
  );

  const ranked = (resilience?.impacts ?? []).slice(0, 8);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error ? (
          <div className="p-3">
            <ErrorNote error={error} />
          </div>
        ) : null}

        {loading && !resilience && (
          <div className="p-4">
            <div className="font-label text-[12px] text-zinc-400">Scoring every satellite</div>
            <div className="mt-1 font-data text-[11px] text-zinc-600">
              One full simulation per node
            </div>
            <div className="mt-3">
              <IndeterminateBar />
            </div>
          </div>
        )}

        {!loading && !error && ranked.length === 0 && (
          <EmptyState title="No impact to rank" hint="Every satellite in this configuration can fail without moving the worst-served client." />
        )}

        {ranked.map((impact, index) => {
          const level = criticalityLevel(impact.criticality);
          const selected = state.selectedSatelliteId === impact.satellite_id;

          return (
            <button
              key={impact.satellite_id}
              type="button"
              onClick={() =>
                dispatch({ type: 'selectSatellite', satelliteId: impact.satellite_id, focus: true })
              }
              aria-pressed={selected}
              className={cn(
                'flex w-full items-stretch border-b border-rule text-left transition-colors focus-visible:outline-none',
                selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
              )}
            >
              <span
                className={cn(
                  'flex w-9 flex-shrink-0 items-start justify-center border-r border-rule pt-2.5 font-data text-[10px] tabular-nums',
                  selected ? 'text-zinc-200' : 'text-zinc-500',
                )}
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <span className="min-w-0 flex-1 px-3 py-2.5">
                <span className="flex items-baseline gap-2">
                  <span
                    className="h-2.5 w-0.5 self-center"
                    style={{ background: colors[impact.plane_id] ?? '#52525b' }}
                  />
                  <span className="font-data text-[12px] text-zinc-100">{impact.satellite_id}</span>
                  <span
                    className={cn(
                      'ml-auto font-data text-[9px] tracking-[0.08em]',
                      impact.breaks_target ? 'text-alarm' : 'text-zinc-500',
                    )}
                  >
                    {impact.breaks_target ? 'BREAKS SLA' : level.token}
                  </span>
                  <span className="w-6 text-right font-data text-[11px] tabular-nums text-zinc-200">
                    {Math.round(impact.criticality)}
                  </span>
                </span>

                <span className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="font-label text-[11px] text-zinc-500">Availability impact</span>
                  <span className="font-data text-[11px] tabular-nums text-zinc-200">
                    −{formatPercent(impact.worst_availability_drop, 2)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}

        {resilience?.gateway_dependency.map((dependency) => (
          <GatewayExposure key={dependency.gateway_id} dependency={dependency} />
        ))}

        <SensitivityPanel runInput={runInput} />
      </div>

      <div className="flex-shrink-0 space-y-2 border-t border-rule p-3">
        <div className="space-y-1">
          {locks.map((lock, index) => (
            <div key={lock.planeId} className="flex items-center gap-2 font-data text-[10px] text-zinc-500">
              <span className="h-2.5 w-0.5" style={{ background: colors[lock.planeId] }} />
              <span className="text-zinc-300">{lock.planeId}</span>
              {(['raanLocked', 'phaseLocked'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setLocks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, [key]: !item[key] } : item,
                      ),
                    )
                  }
                  className={cn(
                    'ml-auto flex items-center gap-1 border px-1.5 py-0.5 transition-colors first-of-type:ml-auto',
                    lock[key]
                      ? 'border-zinc-600 text-zinc-200'
                      : 'border-rule text-zinc-600 hover:text-zinc-400',
                  )}
                >
                  {lock[key] ? <Lock size={9} /> : <LockOpen size={9} />}
                  {key === 'raanLocked' ? 'RAAN' : 'PHASE'}
                </button>
              ))}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => optimizer.start.mutate(locks)}
          disabled={optimizer.running || optimizer.start.isPending}
          className="group flex h-10 w-full items-center justify-between border border-zinc-600 px-3 font-label text-[13px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:outline-none disabled:opacity-50"
        >
          <span>Optimize configuration</span>
          <span className="font-data text-[10px] tabular-nums text-zinc-500 transition-colors group-hover:text-black/55">
            {locks.filter((lock) => !lock.raanLocked || !lock.phaseLocked).length} planes free
          </span>
        </button>

        {optimizer.start.isError && <ErrorNote error={optimizer.start.error} />}
      </div>

      <AnimatePresence>
        {(optimizer.running || optimizer.result) && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="absolute inset-0 z-30 flex flex-col bg-black"
          >
            {optimizer.running ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6">
                <div className="w-full max-w-[220px]">
                  <div className="font-label text-[13px] text-zinc-200">Searching configurations</div>
                  <div className="mt-1 font-data text-[11px] tabular-nums text-zinc-500">
                    {optimizer.status?.explored ?? 0} / {optimizer.status?.total ?? '—'} explored
                  </div>
                  <div className="mt-3">
                    {optimizer.status?.total ? (
                      <ProgressBar value={optimizer.status.progress} />
                    ) : (
                      <IndeterminateBar />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              optimizer.result && (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex flex-shrink-0 items-start justify-between border-b border-rule px-3 pb-2.5 pt-3">
                    <div>
                      <div className="font-label text-[11px] text-zinc-500">Optimizer</div>
                      <div className="font-data text-[13px] text-zinc-100">
                        {optimizer.result.improved ? 'Recommended' : 'No improvement found'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={optimizer.dismiss}
                      aria-label="Dismiss recommendation"
                      className="text-zinc-500 transition-colors hover:text-zinc-100"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {[
                      {
                        label: 'Worst availability',
                        from: formatPercent(optimizer.result.baseline.worst_availability),
                        to: formatPercent(optimizer.result.best.worst_availability),
                      },
                      {
                        label: 'Longest outage',
                        from: formatDuration(optimizer.result.baseline.worst_outage_s),
                        to: formatDuration(optimizer.result.best.worst_outage_s),
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-baseline gap-2 border-b border-rule px-3 py-2.5">
                        <span className="font-label text-[12px] text-zinc-400">{row.label}</span>
                        <span className="ml-auto font-data text-[11px] tabular-nums text-zinc-600">{row.from}</span>
                        <span className="font-data text-[11px] text-zinc-700">→</span>
                        <span className="font-data text-[12px] tabular-nums text-zinc-100">{row.to}</span>
                      </div>
                    ))}

                    {Object.keys(optimizer.result.changed_planes).length > 0 && (
                      <div className="border-b border-rule px-3 py-2.5">
                        <div className="font-label text-[12px] text-zinc-400">Orbit changes</div>
                        <div className="mt-2 space-y-1.5">
                          {Object.entries(optimizer.result.changed_planes).flatMap(([planeId, change]) =>
                            (['raan_deg', 'phase_deg'] as const)
                              .filter((key) => change[key] !== null)
                              .map((key) => {
                                const plane = scenario.design.planes.find((item) => item.id === planeId);
                                return (
                                  <div
                                    key={`${planeId}-${key}`}
                                    className="flex items-baseline gap-2 font-data text-[11px] tabular-nums"
                                  >
                                    <span className="h-2.5 w-0.5 self-center" style={{ background: colors[planeId] }} />
                                    <span className="text-zinc-300">{planeId}</span>
                                    <span className="text-[10px] text-zinc-500">
                                      {key === 'raan_deg' ? 'RAAN' : 'PHASE'}
                                    </span>
                                    <span className="ml-auto text-zinc-600">
                                      {formatDegrees(
                                        key === 'raan_deg' ? (plane?.raan_deg ?? 0) : (plane?.phase_deg ?? 0),
                                      )}
                                    </span>
                                    <span className="text-zinc-700">→</span>
                                    <span className="text-zinc-100">{formatDegrees(change[key] as number)}</span>
                                  </div>
                                );
                              }),
                          )}
                        </div>
                      </div>
                    )}

                    <p className="px-3 py-3 font-label text-[11px] leading-relaxed text-zinc-400">
                      {optimizer.result.verdict}
                    </p>
                  </div>

                  <div className="flex-shrink-0 space-y-2 border-t border-rule p-3">
                    <button
                      type="button"
                      disabled={!optimizer.result.improved}
                      onClick={() => {
                        dispatch({ type: 'applyPlanes', planes: toPlaneOverrides(optimizer.result!.changed_planes) });
                        optimizer.dismiss();
                      }}
                      className="flex h-10 w-full items-center justify-center border border-zinc-600 font-label text-[13px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:outline-none disabled:opacity-40"
                    >
                      Apply configuration
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        optimizer.dismiss();
                        dispatch({ type: 'setTab', tab: 'compare' });
                      }}
                      className="flex h-9 w-full items-center justify-center border border-rule-strong font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none"
                    >
                      Compare saved variants
                    </button>
                  </div>
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const toPlaneOverrides = (
  changed: Record<string, { raan_deg: number | null; phase_deg: number | null }>,
): Record<string, { raan_deg?: number; phase_deg?: number }> =>
  Object.fromEntries(
    Object.entries(changed).map(([planeId, change]) => [
      planeId,
      {
        ...(change.raan_deg !== null ? { raan_deg: change.raan_deg } : {}),
        ...(change.phase_deg !== null ? { phase_deg: change.phase_deg } : {}),
      },
    ]),
  );

function GatewayExposure({ dependency }: { dependency: GatewayDependency }) {
  return (
    <div className="border-b border-rule px-3 py-3">
      <div className="font-label text-[12px] text-zinc-300">Gateway exposure</div>
      <div className="mt-2 space-y-1.5 font-data text-[11px] tabular-nums">
        <Row label={dependency.gateway_id} value={`${dependency.serving_satellites.length} feeders`} />
        <Row label="Busiest feeder" value={`${dependency.busiest_satellite ?? '—'} · ${formatPercent(dependency.busiest_share)}`} />
        <Row label="Carrying traffic" value={formatPercent(dependency.contact_availability)} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </div>
  );
}
