'use client';

import { useState } from 'react';
import { ChevronDown, PanelLeftClose } from 'lucide-react';
import { RouteChain, type RouteTrace } from '@/entities/simulation';
import { cn } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ClientMetrics } from '@/shared/api';


interface NetworkHealthProps {
  clients: ClientMetrics[];
  traces: RouteTrace[];
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  stale: boolean;
  onHide: () => void;
}

export function NetworkHealth({
  clients,
  traces,
  selectedClientId,
  onSelectClient,
  stale,
  onHide,
}: NetworkHealthProps) {
  const { t, formatDuration } = useI18n();
  const [routesOpen, setRoutesOpen] = useState(true);

  const longestOutage = clients.reduce((longest, client) => Math.max(longest, client.max_outage_s), 0);
  const stranded = traces.filter((trace) => !trace.available);
  const cutOff = stranded.length > 0;

  return (
    <div
      data-tour="health"
      className="pointer-events-none absolute left-3 top-3 z-10 w-[232px] border border-rule-strong bg-black p-3.5 sm:w-[268px] lg:left-6 lg:top-6 lg:p-5"
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0', cutOff ? 'bg-alarm' : 'bg-zinc-100')} />
        <span className="font-label text-[13px] text-zinc-300">{t('health.title')}</span>
        {stale && <span className="font-data text-[9px] tracking-[0.08em] text-zinc-600">SYNC</span>}
        <button
          type="button"
          onClick={onHide}
          aria-label={t('health.hide')}
          title={t('health.hide')}
          className="pointer-events-auto -mr-1 ml-auto flex h-5 w-5 shrink-0 items-center justify-center text-zinc-600 transition-colors hover:text-zinc-200 focus-visible:text-zinc-200 focus-visible:outline-none"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Open by default, since the routes are what a newcomer should see
          first; foldable, because a scenario with dozens of sites would
          otherwise bury the map under the list. */}
      <button
        type="button"
        onClick={() => setRoutesOpen((open) => !open)}
        aria-expanded={routesOpen}
        aria-label={routesOpen ? t('health.collapseRoutes') : t('health.expandRoutes')}
        title={routesOpen ? t('health.collapseRoutes') : t('health.expandRoutes')}
        className="group pointer-events-auto mt-2.5 flex w-full items-center gap-2 text-left focus-visible:outline-none"
      >
        <span className="font-label text-[11px] text-zinc-400 group-hover:text-zinc-200">{t('health.routes')}</span>
        <span className="font-data text-[9px] tabular-nums text-zinc-600">{clients.length}</span>
        <ChevronDown
          size={13}
          className={cn(
            'ml-auto text-zinc-600 transition-transform group-hover:text-zinc-200',
            !routesOpen && '-rotate-90',
          )}
        />
      </button>

      {routesOpen && (
        <div className="pointer-events-auto mt-2 max-h-[min(16rem,40vh)] space-y-px overflow-y-auto overscroll-contain pr-1">
          {clients.map((client) => {
            const trace = traces.find((item) => item.clientId === client.client_id);
            const focused = client.client_id === selectedClientId;

            return (
              // The row is a container, not a control: the hops inside the
              // chain are buttons of their own, and a button cannot hold a
              // button. Picking the client stays on the summary line.
              <div
                key={client.client_id}
                className={cn(
                  'border-l-2 py-1 pl-2 pr-1 transition-colors',
                  focused ? 'border-l-current bg-white/[0.06]' : 'border-l-transparent hover:bg-white/[0.03]',
                )}
                style={{ color: trace?.color }}
              >
                <button
                  type="button"
                  onClick={() => onSelectClient(client.client_id)}
                  aria-pressed={focused}
                  className="block w-full text-left focus-visible:outline-none"
                >
                  <span className="flex items-baseline justify-between gap-2 font-data text-[12px] tabular-nums sm:text-[13px]">
                    <span className={focused ? 'text-zinc-100' : 'text-zinc-400'}>
                      {client.client_id}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block font-data text-[10.5px] leading-tight',
                      trace?.available === false ? 'text-alarm' : 'text-zinc-500',
                    )}
                  >
                    {trace
                      ? trace.available
                        ? t('health.hops', {
                            count: trace.hops ?? 0,
                            gateway: trace.gatewayId ?? t('health.gateway'),
                          })
                        : t('health.noRoute', {
                            reason: trace.reason
                              ? t(`route.${trace.reason}` as 'route.none')
                              : t('health.unreachable'),
                          })
                      : '—'}
                  </span>
                </button>
                {focused && trace?.available && (
                  <RouteChain trace={trace} className="mt-1.5" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-2 font-data text-[12px] tabular-nums sm:text-[13px]">
        <span className="font-label text-[13px] text-zinc-400">{t('health.maxOutage')}</span>
        <span className="text-zinc-100">{formatDuration(longestOutage)}</span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 font-data text-[12px] tabular-nums sm:text-[13px]">
        <span className="font-label text-[13px] text-zinc-400">{t('health.offline')}</span>
        <span
          className={cn(
            'pointer-events-auto max-h-12 overflow-y-auto text-right break-words',
            stranded.length ? 'text-alarm' : 'text-zinc-100',
          )}
        >
          {stranded.length ? stranded.map((trace) => trace.clientId).join(' ') : t('health.none')}
        </span>
      </div>
    </div>
  );
}
