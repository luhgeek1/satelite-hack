'use client';

import { useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { DeploymentControl } from '@/features/configure-deployment';
import { PlaneControls } from '@/features/configure-planes';
import { OutageList } from '@/features/inspect-outages';
import { SaveVariantButton } from '@/features/manage-variants';
import { useSession } from '@/entities/session';
import type { SatelliteView } from '@/entities/satellite';
import type { GroundSiteView } from '@/entities/ground-site';
import { cn, formatLatitude, formatLongitude } from '@/shared/lib';
import { Button, ParamGroup } from '@/shared/ui';
import type { ClientMetrics, ScenarioDocument } from '@/shared/api';

type GroupId = 'deployment' | 'planes' | 'outages' | 'failures' | 'satellites' | 'sites';

interface ConfigPanelProps {
  scenario: ScenarioDocument;
  satellites: SatelliteView[];
  sites: GroundSiteView[];
  colors: Record<string, string>;
  onInjectFailure: (satelliteId: string) => void;
  onRestore: (satelliteId: string) => void;
  clients: ClientMetrics[];
  focusClientId: string | null;
  currentTS: number;
  stepS: number;
  exportHref: string | null;
  scenarioHref: string | null;
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
  exportHref,
  scenarioHref,
}: ConfigPanelProps) {
  const { state, dispatch } = useSession();
  const [open, setOpen] = useState<Record<GroupId, boolean>>({
    deployment: true,
    planes: true,
    outages: true,
    failures: false,
    satellites: false,
    sites: false,
  });
  const [picking, setPicking] = useState(false);

  const toggle = (id: GroupId) => setOpen((current) => ({ ...current, [id]: !current[id] }));

  const failures = state.config.failures ?? [];
  const deployed = satellites.filter((satellite) => satellite.deployed);
  const gateways = sites.filter((site) => site.role === 'gateway');
  const clients = sites.filter((site) => site.role === 'client');
  const planeSummary = scenario.design.planes
    .map((plane) =>
      Math.round(state.config.planes?.[plane.id]?.raan_deg ?? plane.raan_deg)
        .toString()
        .padStart(3, '0'),
    )
    .join(' ');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ParamGroup
          code="DPL"
          title="Deployment"
          value={`${deployed.length} SV`}
          open={open.deployment}
          onToggle={() => toggle('deployment')}
        >
          <DeploymentControl scenario={scenario} />
        </ParamGroup>

        <ParamGroup
          code="ORB"
          title="Orbital planes"
          value={planeSummary}
          open={open.planes}
          onToggle={() => toggle('planes')}
        >
          <PlaneControls scenario={scenario} colors={colors} />
        </ParamGroup>

        <ParamGroup
          code="OUT"
          title="Outages"
          alarm={clientMetrics.some((client) => !client.meets_target)}
          value={
            clientMetrics.length
              ? `${clientMetrics.reduce((total, client) => total + client.outage_windows.length, 0)} gaps`
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
          title="Failures"
          alarm={failures.length > 0}
          value={failures.length ? `${failures.length} DOWN` : 'NONE'}
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
                  <span className="font-data text-[10px] text-alarm">FAIL</span>
                  <span className="font-data text-[11px] text-zinc-200">{failure.satellite_id}</span>
                  <span className="font-data text-[10px] text-zinc-500">{satellite?.planeId}</span>
                  <button
                    type="button"
                    onClick={() => onRestore(failure.satellite_id)}
                    className="ml-auto font-label text-[11px] text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline focus-visible:outline-none"
                  >
                    Restore
                  </button>
                </div>
              );
            })}

            {failures.length === 0 && !picking && (
              <p className="font-label text-[11px] leading-relaxed text-zinc-500">
                All {deployed.length} nodes nominal. Inject a failure to see how routing copes.
              </p>
            )}

            {picking ? (
              <div className="space-y-2 border border-rule-strong p-2">
                <label htmlFor="failure-target" className="block font-label text-[11px] text-zinc-400">
                  Which satellite fails?
                </label>
                <select
                  id="failure-target"
                  autoFocus
                  defaultValue=""
                  className="param-select w-full border border-rule-strong bg-black py-1.5 pl-2 pr-6 font-data text-[11px] text-zinc-200 focus:border-zinc-500 focus:outline-none"
                  onChange={(event) => {
                    if (event.target.value) onInjectFailure(event.target.value);
                    setPicking(false);
                  }}
                >
                  <option value="" disabled>
                    Select a node
                  </option>
                  {deployed
                    .filter((satellite) => !satellite.failed)
                    .map((satellite) => (
                      <option key={satellite.id} value={satellite.id}>
                        {satellite.id} {satellite.planeId}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="w-full border border-rule py-1.5 font-label text-[11px] text-zinc-500 transition-colors hover:border-rule-strong hover:text-zinc-300 focus-visible:outline-none"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 border border-rule-strong py-1.5 font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none"
              >
                <Plus size={12} /> Inject failure
              </button>
            )}
          </div>
        </ParamGroup>

        <ParamGroup
          code="SV"
          title="Satellites"
          value={`${deployed.length}/${satellites.length}`}
          open={open.satellites}
          onToggle={() => toggle('satellites')}
        >
          <div className="flex items-center gap-2 border-b border-rule pb-1 pl-[10px] pr-0.5 font-data text-[9px] tracking-[0.08em] text-zinc-500">
            <span>NODE</span>
            <span className="ml-auto">PLANE</span>
            <span className="w-9 text-right">STATE</span>
          </div>

          <div className="max-h-[clamp(9rem,24vh,17rem)] overflow-y-auto overscroll-contain">
            {satellites.map((satellite) => {
              const selected = state.selectedSatelliteId === satellite.id;
              const label = !satellite.deployed ? 'STBY' : satellite.failed ? 'FAIL' : 'NOM';

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
                  <span className={cn('w-9 text-right text-[10px]', label === 'FAIL' ? 'text-alarm' : 'text-zinc-500')}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </ParamGroup>

        <ParamGroup
          code="GND"
          title="Ground sites"
          value={`${gateways.length} GW  ${clients.length} CL`}
          open={open.sites}
          onToggle={() => toggle('sites')}
        >
          <div className="space-y-2.5">
            {[...gateways, ...clients].map((site) => (
              <div key={site.id} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-1 h-2 w-2 shrink-0 bg-zinc-500',
                    site.role === 'gateway'
                      ? 'rotate-45'
                      : '[clip-path:polygon(50%_0,100%_100%,0_100%)]',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-data text-[11px] text-zinc-200">{site.id}</span>
                    <span className="truncate font-label text-[11px] text-zinc-500">{site.name}</span>
                    <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-zinc-500">
                      {site.role === 'gateway' ? 'GW' : 'CL'}
                    </span>
                  </div>
                  <div className="font-data text-[10px] tabular-nums text-zinc-500">
                    {formatLatitude(site.lat)} {formatLongitude(site.lon)}
                  </div>
                </div>
              </div>
            ))}
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
            Reset
          </Button>
          <a
            href={exportHref ?? '#'}
            aria-disabled={!exportHref}
            className={cn(
              'inline-flex h-8 flex-1 items-center justify-center border border-rule-strong px-2.5 font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100',
              !exportHref && 'pointer-events-none opacity-45',
            )}
          >
            Export result
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
          Download effective scenario
        </a>
      </div>
    </div>
  );
}
