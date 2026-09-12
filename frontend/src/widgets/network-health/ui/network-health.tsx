'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn, formatDuration, formatPercent, NO_ROUTE_COPY } from '@/shared/lib';
import type { ClientMetrics, RouteDto } from '@/shared/api';

interface NetworkHealthProps {
  clients: ClientMetrics[];
  target: number;
  routes: RouteDto[];
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  stale: boolean;
}

export function NetworkHealth({
  clients,
  target,
  routes,
  selectedClientId,
  onSelectClient,
  stale,
}: NetworkHealthProps) {
  const [expanded, setExpanded] = useState(true);

  const focusClient = selectedClientId ?? clients[0]?.client_id ?? null;
  const route = routes.find((item) => item.client_id === focusClient);
  const longestOutage = clients.reduce((longest, client) => Math.max(longest, client.max_outage_s), 0);
  const degraded = clients.some((client) => !client.meets_target) || route?.available === false;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 w-[195px] border border-rule-strong bg-black/70 p-3 backdrop-blur sm:w-[220px] lg:left-6 lg:top-6 lg:p-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="pointer-events-auto flex w-full items-center gap-2 text-left transition-colors hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:outline-none"
        aria-expanded={expanded}
      >
        <span className={cn('h-1.5 w-1.5 shrink-0', degraded ? 'bg-alarm' : 'bg-zinc-500')} />
        <span className="font-label text-[12px] text-zinc-300">Network health</span>
        {stale && <span className="font-data text-[9px] tracking-[0.08em] text-zinc-600">SYNC</span>}
        <ChevronDown
          size={13}
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
            <div className="pointer-events-auto mt-3 space-y-1.5 font-data text-[11px] tabular-nums sm:text-xs">
              {clients.map((client) => (
                <button
                  key={client.client_id}
                  type="button"
                  onClick={() => onSelectClient(client.client_id)}
                  className={cn(
                    'flex w-full items-baseline justify-between gap-2 text-left transition-colors',
                    client.client_id === focusClient ? 'text-zinc-100' : 'hover:text-zinc-200',
                  )}
                >
                  <span className={cn(client.client_id === focusClient ? 'text-zinc-200' : 'text-zinc-400')}>
                    {client.client_id}
                  </span>
                  <span className={client.meets_target ? 'text-zinc-100' : 'text-alarm'}>
                    {formatPercent(client.availability)}
                  </span>
                </button>
              ))}
              <div className="flex items-baseline justify-between gap-2 text-zinc-500">
                <span className="font-label text-[12px]">Target</span>
                <span>&ge; {formatPercent(target, 0)}</span>
              </div>
            </div>

            <div className="my-3 border-t border-rule" />

            <div className="flex items-baseline justify-between gap-2 font-data text-[11px] tabular-nums sm:text-xs">
              <span className="font-label text-[12px] text-zinc-400">Max outage</span>
              <span className="text-zinc-100">{formatDuration(longestOutage)}</span>
            </div>

            <div className="mt-2 font-data text-[11px] tabular-nums">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-label text-[12px] text-zinc-400">Route</span>
                <span className={route?.available ? 'text-zinc-100' : 'text-alarm'}>
                  {route?.available ? `${route.hops} hops` : 'no route'}
                </span>
              </div>
              <div className="mt-1 break-words text-[10px] leading-relaxed text-zinc-500">
                {route?.available
                  ? route.path.join(' → ')
                  : route?.reason
                    ? NO_ROUTE_COPY[route.reason]
                    : '—'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
