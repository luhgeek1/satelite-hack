'use client';

import { Lock, LockOpen } from 'lucide-react';
import { SensitivityPanel } from '@/features/analyze-sensitivity';
import {
  estimateSeconds,
  gridSize,
  SEARCH_DEPTHS,
  type Optimizer,
  type PlaneLock,
  type SearchDepth,
} from '@/features/run-optimizer';
import { useSession } from '@/entities/session';
import type { RunInput } from '@/entities/simulation';
import { cn, criticalityLevel, formatPercent, formatWait } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { EmptyState, ErrorNote, IndeterminateBar } from '@/shared/ui';
import type { GatewayDependency, ResilienceResponse } from '@/shared/api';

interface CriticalNodesProps {
  resilience: ResilienceResponse | undefined;
  loading: boolean;
  error: unknown;
  colors: Record<string, string>;
  runInput: RunInput;
  /** Owned by the studio: the run is reported in the corner, not in here. */
  optimizer: Optimizer;
  onOptimize: () => void;
  depth: SearchDepth;
  onDepthChange: (depth: SearchDepth) => void;
  locks: PlaneLock[];
  onLocksChange: (locks: PlaneLock[]) => void;
}

export function CriticalNodes({
  resilience,
  loading,
  error,
  colors,
  runInput,
  optimizer,
  onOptimize,
  depth,
  onDepthChange,
  locks,
  onLocksChange,
}: CriticalNodesProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();

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
            <div className="font-label text-[12px] text-zinc-400">{t('critical.scoring')}</div>
            <div className="mt-1 font-data text-[11px] text-zinc-600">
              {t('critical.scoringHint')}
            </div>
            <div className="mt-3">
              <IndeterminateBar />
            </div>
          </div>
        )}

        {!loading && !error && ranked.length === 0 && (
          <EmptyState title={t('critical.empty')} hint={t('critical.emptyHint')} />
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
                    {impact.breaks_target
                      ? t('critical.breaksSla')
                      : t(`criticality.token.${level.tier}` as 'criticality.token.low')}
                  </span>
                  <span className="w-6 text-right font-data text-[11px] tabular-nums text-zinc-200">
                    {Math.round(impact.criticality)}
                  </span>
                </span>

                <span className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="font-label text-[11px] text-zinc-500">{t('critical.impact')}</span>
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
                    onLocksChange(
                      locks.map((item, itemIndex) =>
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

        <div className="flex items-stretch gap-px border border-rule">
          {(Object.keys(SEARCH_DEPTHS) as SearchDepth[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onDepthChange(key)}
              disabled={optimizer.running}
              aria-pressed={depth === key}
              className={cn(
                'flex flex-1 flex-col items-center py-1 font-label text-[11px] transition-colors',
                depth === key ? 'bg-zinc-100 text-black' : 'text-zinc-500 hover:text-zinc-200',
              )}
            >
              {t(`critical.depth.${key}` as never)}
              <span className="font-data text-[9px] tabular-nums opacity-70">
                {gridSize(locks, key).toLocaleString('en-US')}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onOptimize}
          disabled={optimizer.running || optimizer.start.isPending || gridSize(locks, depth) === 0}
          className="group flex h-10 w-full items-center justify-between border border-zinc-600 px-3 font-label text-[13px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:outline-none disabled:opacity-50"
        >
          <span>{t('critical.optimize')}</span>
          <span className="font-data text-[10px] tabular-nums text-zinc-500 transition-colors group-hover:text-black/55">
            {t('critical.searchCost', {
              runs: gridSize(locks, depth).toLocaleString('en-US'),
              wait: formatWait(estimateSeconds(gridSize(locks, depth))),
            })}
          </span>
        </button>

        <p className="font-label text-[10px] leading-relaxed text-zinc-600">
          {t(`critical.depthHint.${depth}` as never)} {t('critical.searchNote')}
        </p>

        {optimizer.start.isError && <ErrorNote error={optimizer.start.error} />}
      </div>

    </>
  );
}

function GatewayExposure({ dependency }: { dependency: GatewayDependency }) {
  const { t } = useI18n();

  return (
    <div className="border-b border-rule px-3 py-3">
      <div className="font-label text-[12px] text-zinc-300">{t('gateway.title')}</div>
      <div className="mt-2 space-y-1.5 font-data text-[11px] tabular-nums">
        <Row
          label={dependency.gateway_id}
          value={t('gateway.feeders', { count: dependency.serving_satellites.length })}
        />
        <Row
          label={t('gateway.busiest')}
          value={`${dependency.busiest_satellite ?? '—'} · ${formatPercent(dependency.busiest_share)}`}
        />
        <Row label={t('gateway.carrying')} value={formatPercent(dependency.contact_availability)} />
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
