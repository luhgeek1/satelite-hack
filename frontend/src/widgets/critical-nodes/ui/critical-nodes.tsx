'use client';

import { useState } from 'react';
import { Power, Sparkles } from 'lucide-react';
import { SensitivityPanel } from '@/features/analyze-sensitivity';
import { useSession } from '@/entities/session';
import type { RunInput } from '@/entities/simulation';
import {
  cn,
  criticalityFromImpact,
  criticalityLevel,
  formatPercent,
} from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { EmptyState, ErrorNote, IndeterminateBar } from '@/shared/ui';
import type {
  GatewayDependency,
  ResilienceResponse,
  SatelliteImpact,
  ScenarioDocument,
} from '@/shared/api';


const NO_LOSS = 1 / 720;

const RANKED = 10;

interface CriticalNodesProps {
  resilience: ResilienceResponse | undefined;
  loading: boolean;
  error: unknown;
  colors: Record<string, string>;
  runInput: RunInput;
  scenario: ScenarioDocument;

  onFailForDay: (satelliteId: string) => void;

  onOpenSearch: () => void;
}

const points = (drop: number) => (drop * 100).toFixed(2);











export function CriticalNodes({
  resilience,
  loading,
  error,
  colors,
  runInput,
  scenario,
  onFailForDay,
  onOpenSearch,
}: CriticalNodesProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);

  const ranked = (resilience?.impacts ?? []).slice(0, RANKED);
  const environment = scenario.environment;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <p className="border-b border-rule px-3 py-2.5 font-label text-[11px] leading-relaxed text-zinc-500">
          {t('critical.intro')}
        </p>

        {error ? (
          <div className="p-3">
            <ErrorNote error={error} />
          </div>
        ) : null}

        {loading && !resilience && (
          <div className="border-b border-rule p-4">
            <div className="font-label text-[12px] text-zinc-400">{t('critical.scoring')}</div>
            <div className="mt-1 font-data text-[11px] text-zinc-600">
              {t('critical.scoringHint')}
            </div>
            <div className="mt-3">
              <IndeterminateBar />
            </div>
          </div>
        )}

        {!loading && !error && resilience && ranked.length === 0 && (
          <EmptyState title={t('critical.empty')} hint={t('critical.emptyHint')} />
        )}

        <div data-tour="critical-list">
          {ranked.map((impact, index) => (
            <ImpactRow
              key={impact.satellite_id}
              impact={impact}
              rank={index + 1}
              color={colors[impact.plane_id]}
              open={openId === impact.satellite_id}
              selected={state.selectedSatelliteId === impact.satellite_id}
              onToggle={() => {
                setOpenId((current) => (current === impact.satellite_id ? null : impact.satellite_id));
                dispatch({ type: 'selectSatellite', satelliteId: impact.satellite_id, focus: true });
              }}
              onFailForDay={() => onFailForDay(impact.satellite_id)}
            />
          ))}
        </div>

        {resilience?.gateway_dependency.map((dependency) => (
          <GatewayExposure key={dependency.gateway_id} dependency={dependency} />
        ))}

        <SensitivityPanel
          runInput={runInput}
          target={environment.target_availability}
          currentValues={{
            isl_range_km: environment.isl_range_km,
            min_elevation_deg: environment.min_elevation_deg,
            altitude_km: environment.altitude_km,
          }}
        />
      </div>

      <div className="flex-shrink-0 border-t border-rule p-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-full items-center justify-center gap-2 border border-zinc-600 font-label text-[12px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300 focus-visible:outline-none"
        >
          <Sparkles size={13} />
          {t('critical.toSearch')}
        </button>
        <p className="mt-2 font-label text-[10px] leading-relaxed text-zinc-600">
          {t('critical.toSearchHint')}
        </p>
      </div>
    </>
  );
}

interface ImpactRowProps {
  impact: SatelliteImpact;
  rank: number;
  color: string | undefined;
  open: boolean;
  selected: boolean;
  onToggle: () => void;
  onFailForDay: () => void;
}

function ImpactRow({ impact, rank, color, open, selected, onToggle, onFailForDay }: ImpactRowProps) {
  const { t, formatDuration } = useI18n();

  const score = criticalityFromImpact(impact.worst_availability_drop, impact.breaks_target);
  const level = criticalityLevel(score);
  const clients = Object.entries(impact.per_client_drop).sort((a, b) => b[1] - a[1]);
  const [hardest, hardestDrop] = clients[0] ?? ['—', 0];

  const outages = impact.per_client_outage_growth_s as Record<string, number> | undefined;
  const growth = outages?.[hardest] ?? 0;

  return (
    <div className={cn('border-b border-rule', (open || selected) && 'bg-white/[0.04]')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-stretch text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none"
      >
        <span
          className={cn(
            'flex w-9 flex-shrink-0 items-start justify-center border-r border-rule pt-2.5 font-data text-[10px] tabular-nums',
            open || selected ? 'text-zinc-200' : 'text-zinc-500',
          )}
        >
          {String(rank).padStart(2, '0')}
        </span>

        <span className="min-w-0 flex-1 px-3 py-2">
          <span className="flex items-baseline gap-2">
            <span className="h-2.5 w-0.5 self-center" style={{ background: color ?? '#52525b' }} />
            <span className="font-data text-[12px] text-zinc-100">{impact.satellite_id}</span>
            <span
              className="ml-auto font-data text-[9px] tracking-[0.08em]"
              style={{ color: level.tier === 'low' ? '#71717a' : level.color }}
            >
              {t(`criticality.token.${level.tier}` as 'criticality.token.low')}
            </span>
            <span className="whitespace-nowrap text-right font-data text-[11px] tabular-nums text-zinc-200">
              {t('critical.drop', { value: points(impact.worst_availability_drop) })}
            </span>
          </span>

          <span className="relative mt-1.5 block h-1 w-full bg-white/[0.05]">
            <span
              className="absolute inset-y-0 left-0"
              style={{
                width: `${Math.min(100, (impact.worst_availability_drop / 0.05) * 100)}%`,
                background: level.color,
              }}
            />
          </span>

          <span className="mt-1 flex items-baseline gap-2 font-label text-[10px] text-zinc-500">
            {hardestDrop > NO_LOSS ? t('critical.hitHardest', { client: hardest }) : t('critical.noLoss')}
            {growth > 0 && (
              <span className="ml-auto font-data tabular-nums text-zinc-400">
                {t('critical.outageGrowth', { wait: formatDuration(growth) })}
              </span>
            )}
          </span>
        </span>
      </button>

      {open && (
        <div className="pb-2.5 pl-12 pr-3">
          <div className="space-y-px">
            {clients.map(([client, drop]) => {
              const clientGrowth = outages?.[client] ?? 0;
              const lost = drop > NO_LOSS;
              return (
                <div
                  key={client}
                  className="flex items-baseline gap-2 font-data text-[10px] tabular-nums"
                >
                  <span className="w-10 text-zinc-300">{client}</span>
                  <span className={lost ? 'text-zinc-200' : 'text-zinc-600'}>
                    {lost ? t('critical.drop', { value: points(drop) }) : t('critical.clientKept')}
                  </span>
                  {outages && (
                    <span className="ml-auto text-zinc-500">
                      {clientGrowth > 0
                        ? t('critical.outageGrowth', { wait: formatDuration(clientGrowth) })
                        : t('critical.outageSame')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onFailForDay}
            className="mt-2 flex w-full items-center justify-center gap-1.5 border border-rule-strong py-1.5 font-label text-[11px] text-zinc-300 transition-colors hover:border-alarm/60 hover:text-alarm focus-visible:outline-none"
          >
            <Power size={11} />
            {t('critical.tryIt')}
          </button>
        </div>
      )}
    </div>
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
