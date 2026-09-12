'use client';

import { useState } from 'react';
import { Plus, RadioTower, RotateCcw, SatelliteDish } from 'lucide-react';
import { DeploymentControl } from '@/features/configure-deployment';
import { PlaneControls } from '@/features/configure-planes';
import { SiteConditionsControl } from '@/features/configure-site';
import { FailureForm } from '@/features/inject-failure';
import { GatewayOutageForm } from '@/features/inject-gateway-outage';
import { OutageList } from '@/features/inspect-outages';
import { SaveVariantButton } from '@/features/manage-variants';
import { useSession } from '@/entities/session';
import type { SatelliteView } from '@/entities/satellite';
import { effectiveSiteConditions, type GroundSiteView } from '@/entities/ground-site';
import { ChangeSummary } from './change-summary';
import { cn, formatClock, formatLatitude, formatLongitude, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { Button, ParamGroup } from '@/shared/ui';
import type { ClientMetrics, ScenarioDocument, SimulationSummary } from '@/shared/api';
import type { FailureRequest } from '@/features/inject-failure';

type GroupId = 'deployment' | 'planes' | 'outages' | 'failures' | 'gateway' | 'satellites' | 'sites';

interface ConfigPanelProps {
  scenario: ScenarioDocument;
  satellites: SatelliteView[];
  sites: GroundSiteView[];
  colors: Record<string, string>;
  onInjectFailure: (request: FailureRequest) => void;
  horizonS: number;
  onRestore: (satelliteId: string) => void;
  clients: ClientMetrics[];
  focusClientId: string | null;
  currentTS: number;
  stepS: number;
  exportHref: string | null;
  scenarioHref: string | null;
  summary: SimulationSummary | undefined;
  /** The same scenario with nothing changed, so the panel can show what the changes bought. */
  baseline: SimulationSummary | undefined;
}

export function ConfigPanel({
  scenario,
  satellites,
  sites,
  colors,
  onInjectFailure,
  onRestore,
  clients: clientMetrics,
  focusClientId,
  currentTS,
  stepS,
  horizonS,
  exportHref,
  scenarioHref,
  summary,
  baseline,
}: ConfigPanelProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();
  const [open, setOpen] = useState<Record<GroupId, boolean>>({
    deployment: true,
    planes: true,
    outages: true,
    failures: false,
    gateway: false,
    satellites: false,
    sites: true,
  });
  const [picking, setPicking] = useState(false);
  const [pickingGateway, setPickingGateway] = useState(false);

  const toggle = (id: GroupId) => setOpen((current) => ({ ...current, [id]: !current[id] }));

  const failures = state.config.failures ?? [];
  const gatewayOutages = state.config.gateway_outages ?? scenario.gateway_outages;
  const deployed = satellites.filter((satellite) => satellite.deployed);
  const gateways = sites.filter((site) => site.role === 'gateway');
  const clients = sites.filter((site) => site.role === 'client');
  const obstructed = sites.filter((site) => {
    const conditions = effectiveSiteConditions(site, state.config);
    return conditions !== null && conditions.profile !== 'open';
  }).length;
  const planeSummary = scenario.design.planes
    .map((plane) =>
      Math.round(state.config.planes?.[plane.id]?.raan_deg ?? plane.raan_deg)
        .toString()
        .padStart(3, '0'),
    )
    .join(' ');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChangeSummary scenario={scenario} current={summary} baseline={baseline} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ParamGroup
          code="DPL"
          title={t('config.deployment')}
          value={`${deployed.length} ${t('config.sv')}`}
          open={open.deployment}
          onToggle={() => toggle('deployment')}
        >
          <DeploymentControl scenario={scenario} />
        </ParamGroup>

        <ParamGroup
          code="ORB"
          title={t('config.planes')}
          value={planeSummary}
          open={open.planes}
          onToggle={() => toggle('planes')}
        >
          <PlaneControls scenario={scenario} colors={colors} />
        </ParamGroup>

        <ParamGroup
          code="OUT"
          title={t('config.outages')}
          alarm={clientMetrics.some((client) => !client.meets_target)}
          value={
            clientMetrics.length
              ? t('config.gaps', {
                  count: clientMetrics.reduce(
                    (total, client) => total + client.outage_windows.length,
                    0,
                  ),
                })
              : '—'
          }
          open={open.outages}
          onToggle={() => toggle('outages')}
        >
          <OutageList
            clients={clientMetrics}
            focusClientId={focusClientId}
            currentTS={currentTS}
            stepS={stepS}
          />
        </ParamGroup>

        <ParamGroup
          code="FLT"
          title={t('config.failures')}
          alarm={failures.length > 0}
          value={failures.length ? t('config.down', { count: failures.length }) : t('config.none')}
          open={open.failures}
          onToggle={() => toggle('failures')}
        >
          <div className="mt-1 space-y-1.5">
            {failures.map((failure) => {
              const satellite = satellites.find((item) => item.id === failure.satellite_id);
              return (
                <div
                  key={failure.satellite_id}
                  className="flex items-center gap-2.5 border-l-2 border-alarm bg-white/[0.03] py-1.5 pl-2.5 pr-2"
                >
                  <span className="font-data text-[10px] text-alarm">{t('config.stateFailed')}</span>
                  <span className="font-data text-[11px] text-zinc-200">{failure.satellite_id}</span>
                  <span className="font-data text-[10px] text-zinc-500">{satellite?.planeId}</span>
                  <span className="font-data text-[10px] tabular-nums text-zinc-600">
                    {failure.start_s === 0 && failure.end_s >= horizonS
                      ? t('config.allDay')
                      : `${formatClock(failure.start_s)}–${formatClock(failure.end_s)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestore(failure.satellite_id)}
                    className="ml-auto font-label text-[11px] text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline focus-visible:outline-none"
                  >
                    {t('config.restore')}
                  </button>
                </div>
              );
            })}

            {failures.length === 0 && !picking && (
              <p className="font-label text-[11px] leading-relaxed text-zinc-500">
                {t('config.allNominal', { count: deployed.length })}
              </p>
            )}

            {picking ? (
              <FailureForm
                candidates={deployed.filter((satellite) => !satellite.failed)}
                currentTS={currentTS}
                horizonS={horizonS}
                stepS={stepS}
                onSubmit={(request) => {
                  onInjectFailure(request);
                  setPicking(false);
                }}
                onCancel={() => setPicking(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 border border-rule-strong py-1.5 font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none"
              >
                <Plus size={12} /> {t('config.inject')}
              </button>
            )}
          </div>
        </ParamGroup>

        <ParamGroup
          code="GW"
          title={t('config.gatewayOutages')}
          alarm={gatewayOutages.length > 0}
          value={
            gatewayOutages.length
              ? t('config.gwDown', { count: gatewayOutages.length })
              : t('config.none')
          }
          open={open.gateway}
          onToggle={() => toggle('gateway')}
        >
          <div className="mt-1 space-y-1.5">
            {gatewayOutages.map((outage) => (
              <div
                key={`${outage.gateway_id}-${outage.start_s}`}
                className="flex items-center gap-2.5 border-l-2 border-alarm bg-white/[0.03] py-1.5 pl-2.5 pr-2"
              >
                <span className="font-data text-[10px] text-alarm">{t('config.stateOffline')}</span>
                <span className="font-data text-[11px] text-zinc-200">{outage.gateway_id}</span>
                <span className="font-data text-[10px] tabular-nums text-zinc-600">
                  {outage.start_s === 0 && outage.end_s >= horizonS
                    ? t('config.allDay')
                    : `${formatClock(outage.start_s)}–${formatClock(outage.end_s)}`}
                </span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'removeGatewayOutage', gatewayId: outage.gateway_id })}
                  className="ml-auto font-label text-[11px] text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline focus-visible:outline-none"
                >
                  {t('config.restore')}
                </button>
              </div>
            ))}

            {gatewayOutages.length === 0 && !pickingGateway && (
              <p className="font-label text-[11px] leading-relaxed text-zinc-500">
                {t('config.gatewaysNominal', { count: gateways.length })}
              </p>
            )}

            {pickingGateway ? (
              <GatewayOutageForm
                gateways={gateways}
                currentTS={currentTS}
                horizonS={horizonS}
                stepS={stepS}
                onDone={() => setPickingGateway(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPickingGateway(true)}
                disabled={gateways.length === 0}
                className="mt-2 flex w-full items-center justify-center gap-1.5 border border-rule-strong py-1.5 font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none disabled:opacity-40"
              >
                <Plus size={12} /> {t('config.addGatewayOutage')}
              </button>
            )}
          </div>
        </ParamGroup>

        <ParamGroup
          code="SV"
          title={t('config.satellites')}
          value={`${deployed.length}/${satellites.length}`}
          open={open.satellites}
          onToggle={() => toggle('satellites')}
        >
          <div className="flex items-center gap-2 border-b border-rule pb-1 pl-[10px] pr-0.5 font-data text-[9px] tracking-[0.08em] text-zinc-500">
            <span>{t('config.colNode')}</span>
            <span className="ml-auto">{t('config.colPlane')}</span>
            <span className="w-9 text-right">{t('config.colState')}</span>
          </div>

          <div className="max-h-[clamp(9rem,24vh,17rem)] overflow-y-auto overscroll-contain">
            {satellites.map((satellite) => {
              const selected = state.selectedSatelliteId === satellite.id;
              const nodeState = !satellite.deployed
                ? 'standby'
                : satellite.failed
                  ? 'failed'
                  : 'nominal';
              const label = t(
                nodeState === 'standby'
                  ? 'config.stateStandby'
                  : nodeState === 'failed'
                    ? 'config.stateFailed'
                    : 'config.stateNominal',
              );

              return (
                <button
                  key={satellite.id}
                  type="button"
                  onClick={() =>
                    dispatch({ type: 'selectSatellite', satelliteId: satellite.id, focus: true })
                  }
                  aria-pressed={selected}
                  className={cn(
                    'flex w-full items-center gap-2 border-l-2 py-1 pl-2 pr-0.5 text-left font-data text-[11px] tabular-nums transition-colors focus-visible:bg-white/[0.08] focus-visible:outline-none',
                    selected
                      ? 'border-zinc-200 bg-white/[0.06] text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200',
                    !satellite.deployed && 'text-zinc-600 hover:text-zinc-400',
                  )}
                >
                  <span>{satellite.id}</span>
                  <span className="ml-auto text-zinc-500">{satellite.planeId}</span>
                  <span className={cn('w-9 text-right text-[10px]', nodeState === 'failed' ? 'text-alarm' : 'text-zinc-500')}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </ParamGroup>

        <ParamGroup
          code="GND"
          title={t('config.sites')}
          value={obstructed ? t('config.sitesObstructed', { count: sites.length, obstructed }) : `${sites.length}`}
          open={open.sites}
          onToggle={() => toggle('sites')}
        >
          <div className="space-y-2">
            {[...clients, ...gateways].map((site) => {
              const isTerminal = site.role === 'client';
              const selected = isTerminal && site.id === focusClientId;
              const metrics = clientMetrics.find((client) => client.client_id === site.id);
              const Icon = isTerminal ? SatelliteDish : RadioTower;
              const className = cn(
                'block w-full border p-2.5 text-left',
                selected ? 'border-zinc-500 bg-white/[0.06]' : 'border-rule-strong bg-white/[0.02]',
              );
              const headerClassName = cn(
                'block w-full text-left',
                isTerminal && 'transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-300',
              );
              const content = (
                <>
                  <span className="flex items-center gap-2">
                    <Icon size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />
                    <span className="break-all font-data text-[12px] text-zinc-200">{site.id}</span>
                    <span className="ml-auto shrink-0 font-label text-[10px] text-zinc-500">
                      {isTerminal ? t('config.terminal') : t('config.gatewayRole')}
                    </span>
                  </span>
                  <span className="mt-1.5 block break-words font-label text-[11px] leading-relaxed text-zinc-400">
                    {site.name}
                  </span>
                  <span className="mt-1 block font-data text-[10px] tabular-nums text-zinc-500">
                    {formatLatitude(site.lat)} · {formatLongitude(site.lon)}
                  </span>
                  {isTerminal && (
                    <span className="mt-2 flex items-baseline justify-between gap-2 border-t border-rule pt-2">
                      <span className="font-label text-[10px] text-zinc-500">{t('config.connectivity')}</span>
                      <span className={cn('font-data text-[11px] tabular-nums', metrics && !metrics.meets_target ? 'text-alarm' : 'text-zinc-300')}>
                        {metrics ? formatPercent(metrics.availability) : '—'}
                      </span>
                    </span>
                  )}
                </>
              );

              // The card holds inputs of its own, so the clickable part is the
              // header, not the whole card: a button cannot contain a button.
              return (
                <div key={site.id} className={className}>
                  {isTerminal ? (
                    <button
                      type="button"
                      aria-pressed={selected}
                      title={t('config.showRoute', { site: site.id })}
                      onClick={() => dispatch({ type: 'selectClient', clientId: site.id })}
                      className={headerClassName}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={headerClassName}>{content}</div>
                  )}
                  <SiteConditionsControl
                    site={site}
                    scenarioMaskDeg={scenario.environment.min_elevation_deg}
                    metrics={metrics}
                  />
                </div>
              );
            })}
            {sites.length === 0 && (
              <p className="font-label text-[11px] text-zinc-500">{t('config.noSites')}</p>
            )}
          </div>
        </ParamGroup>
      </div>

      <div className="flex-shrink-0 space-y-2 border-t border-rule p-3">
        <SaveVariantButton suggestedName={scenario.meta.id} />

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => dispatch({ type: 'resetConfig' })}
          >
            <RotateCcw size={12} />
            {t('config.reset')}
          </Button>
          <a
            href={exportHref ?? '#'}
            aria-disabled={!exportHref}
            className={cn(
              'inline-flex h-8 flex-1 items-center justify-center border border-rule-strong px-2.5 font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100',
              !exportHref && 'pointer-events-none opacity-45',
            )}
          >
            {t('config.export')}
          </a>
        </div>

        <a
          href={scenarioHref ?? '#'}
          aria-disabled={!scenarioHref}
          className={cn(
            'inline-flex h-8 w-full items-center justify-center border border-rule px-2.5 font-label text-[11px] text-zinc-500 transition-colors hover:border-rule-strong hover:text-zinc-300',
            !scenarioHref && 'pointer-events-none opacity-45',
          )}
        >
          {t('config.download')}
        </a>
      </div>
    </div>
  );
}
