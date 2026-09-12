'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { RouteChain, type RouteTrace } from '@/entities/simulation';
import { cn, formatDuration, formatPercent, NO_ROUTE_COPY } from '@/shared/lib';
import type { ClientMetrics } from '@/shared/api';

interface NetworkHealthProps {
  clients: ClientMetrics[];
  target: number;
  traces: RouteTrace[];
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  stale: boolean;
}

export function NetworkHealth({
  clients,
  target,
  traces,
  selectedClientId,
  onSelectClient,
  stale,
}: NetworkHealthProps) {
  const [expanded, setExpanded] = useState(true);

  const longestOutage = clients.reduce((longest, client) => Math.max(longest, client.max_outage_s), 0);
  const stranded = traces.filter((trace) => !trace.available);
  const degraded = clients.some((client) => !client.meets_target) || stranded.length > 0;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 w-[232px] border border-rule-strong bg-black/70 p-3.5 backdrop-blur sm:w-[268px] lg:left-6 lg:top-6 lg:p-5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="pointer-events-auto flex w-full items-center gap-2 text-left transition-colors hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:outline-none"
        aria-expanded={expanded}
      >
        <span className={cn('h-2 w-2 shrink-0', degraded ? 'bg-alarm' : 'bg-zinc-500')} />
        <span className="font-label text-[13px] text-zinc-300">Network health</span>
        {stale && <span className="font-data text-[9px] tracking-[0.08em] text-zinc-600">SYNC</span>}
        <ChevronDown
          size={14}
          className={cn('ml-auto shrink-0 text-zinc-600 transition-transform duration-200', !expanded && '-rotate-90')}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="min-h-0 overflow-hidden"
          >
            <div className="pointer-events-auto mt-3 space-y-px">
              {clients.map((client) => {
                const trace = traces.find((item) => item.clientId === client.client_id);
                const focused = client.client_id === selectedClientId;

                return (
                  <button
                    key={client.client_id}
                    type="button"
                    onClick={() => onSelectClient(client.client_id)}
                    aria-pressed={focused}
                    className={cn(
                      'block w-full border-l-2 py-1 pl-2 pr-1 text-left transition-colors',
                      focused ? 'border-l-current bg-white/[0.06]' : 'border-l-transparent hover:bg-white/[0.03]',
                    )}
                    style={{ color: trace?.color }}
                  >
                    <span className="flex items-baseline justify-between gap-2 font-data text-[12px] tabular-nums sm:text-[13px]">
                      <span className={focused ? 'text-zinc-100' : 'text-zinc-400'}>
                        {client.client_id}
                      </span>
                      <span className={client.meets_target ? 'text-zinc-100' : 'text-alarm'}>
                        {formatPercent(client.availability)}
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
                          ? `${trace.hops} hops → ${trace.gatewayId ?? 'gateway'}`
                          : `no route · ${trace.reason ? NO_ROUTE_COPY[trace.reason] : 'unreachable'}`
                        : '—'}
                    </span>
                    {focused && trace?.available && (
                      <RouteChain trace={trace} className="mt-1.5" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2 pl-2 font-data text-[12px] tabular-nums text-zinc-500 sm:text-[13px]">
              <span className="font-label text-[13px]">Target</span>
              <span>&ge; {formatPercent(target, 0)}</span>
            </div>

            <div className="my-3 border-t border-rule" />

            <div className="flex items-baseline justify-between gap-2 font-data text-[12px] tabular-nums sm:text-[13px]">
              <span className="font-label text-[13px] text-zinc-400">Max outage</span>
              <span className="text-zinc-100">{formatDuration(longestOutage)}</span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2 font-data text-[12px] tabular-nums sm:text-[13px]">
              <span className="font-label text-[13px] text-zinc-400">Offline now</span>
              <span className={stranded.length ? 'text-alarm' : 'text-zinc-100'}>
                {stranded.length
                  ? stranded.map((trace) => trace.clientId).join(' ')
                  : 'none'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
