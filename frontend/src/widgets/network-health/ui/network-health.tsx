'use client';

import { useState } from 'react';
import { ChevronDown, PanelLeftClose, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { RouteChain, type RouteTrace } from '@/entities/simulation';
import { cn } from '@/shared/lib';
import { FeatureHint } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { ClientMetrics } from '@/shared/api';


interface NetworkHealthProps {
  clients: ClientMetrics[];
  traces: RouteTrace[];
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  stale: boolean;
  optimizing: boolean;
  onOptimize: () => void;
  onHide: () => void;
}

export function NetworkHealth({
  clients,
  traces,
  selectedClientId,
  onSelectClient,
  stale,
  optimizing,
  onOptimize,
  onHide,
}: NetworkHealthProps) {
  const { t, formatDuration } = useI18n();
  const [routesOpen, setRoutesOpen] = useState(false);

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

      <button
        type="button"
        onClick={() => setRoutesOpen((value) => !value)}
        aria-expanded={routesOpen}
        title={routesOpen ? t('health.collapseRoutes') : t('health.expandRoutes')}
        className="pointer-events-auto mt-2.5 flex w-full items-center gap-2 text-left transition-colors hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:outline-none"
      >
        <span className="font-label text-[11px] text-zinc-400">{t('health.routes')}</span>
        <span className="font-data text-[9px] tabular-nums text-zinc-600">{clients.length}</span>
        <ChevronDown
          size={12}
          className={cn('ml-auto shrink-0 text-zinc-600 transition-transform duration-200', !routesOpen && '-rotate-90')}
        />
      </button>

      <AnimatePresence initial={false}>
        {routesOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="min-h-0 overflow-hidden"
          >
            <div className="pointer-events-auto mt-2 space-y-px">
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
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 flex items-baseline justify-between gap-2 font-data text-[12px] tabular-nums sm:text-[13px]">
        <span className="font-label text-[13px] text-zinc-400">{t('health.maxOutage')}</span>
        <span className="text-zinc-100">{formatDuration(longestOutage)}</span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 font-data text-[12px] tabular-nums sm:text-[13px]">
        <span className="font-label text-[13px] text-zinc-400">{t('health.offline')}</span>
        <span className={stranded.length ? 'text-alarm' : 'text-zinc-100'}>
          {stranded.length ? stranded.map((trace) => trace.clientId).join(' ') : t('health.none')}
        </span>
      </div>

      <div className="mt-3 border-t border-rule pt-3">
        {/* The bubble hangs below: the card sits at the top of the map, and
            above this button is the card's own content. */}
        <FeatureHint
          title={t('optimizer.tipTitle')}
          text={t('optimizer.tipText')}
          side="bottom"
          className="block"
        >
          <button
            type="button"
            onClick={onOptimize}
            disabled={optimizing}
            className={cn(
              'pointer-events-auto flex h-9 w-full items-center justify-center gap-2 border font-label text-[13px] transition-colors focus-visible:outline-none',
              optimizing
                ? 'cursor-wait border-rule-strong text-zinc-500'
                : 'border-rule-strong text-zinc-100 hover:border-zinc-500 hover:text-white focus-visible:border-zinc-300 focus-visible:text-white',
            )}
          >
            <Zap size={14} />
            {optimizing ? t('health.optimizing') : t('health.optimize')}
          </button>
        </FeatureHint>
      </div>
    </div>
  );
}
