'use client';

import { useSession } from '@/entities/session';
import { cn, formatClock, formatDuration, NO_ROUTE_COPY } from '@/shared/lib';
import type { ClientMetrics } from '@/shared/api';

interface OutageListProps {
  clients: ClientMetrics[];
  focusClientId: string | null;
  currentTS: number;
  stepS: number;
}

export function OutageList({ clients, focusClientId, currentTS, stepS }: OutageListProps) {
  const { dispatch } = useSession();

  const client = clients.find((item) => item.client_id === focusClientId) ?? clients[0];
  if (!client) return null;

  const windows = [...client.outage_windows].sort((a, b) => b.duration_s - a.duration_s);

  if (windows.length === 0) {
    return (
      <p className="font-label text-[11px] leading-relaxed text-zinc-500">
        {client.client_id} keeps a route to the gateway for the whole horizon.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {clients.map((item) => (
          <button
            key={item.client_id}
            type="button"
            onClick={() => dispatch({ type: 'selectClient', clientId: item.client_id })}
            aria-pressed={item.client_id === client.client_id}
            className={cn(
              'border px-2 py-0.5 font-data text-[10px] transition-colors focus-visible:outline-none',
              item.client_id === client.client_id
                ? 'border-zinc-500 text-zinc-100'
                : 'border-rule text-zinc-500 hover:border-rule-strong hover:text-zinc-300',
            )}
          >
            {item.client_id}
          </button>
        ))}
      </div>

      <div className="max-h-[clamp(8rem,22vh,15rem)] space-y-px overflow-y-auto overscroll-contain">
        {windows.map((window) => {
          const active = currentTS >= window.start_s && currentTS < window.end_s;

          return (
            <button
              key={`${window.start_s}-${window.end_s}`}
              type="button"
              onClick={() => {
                dispatch({ type: 'selectClient', clientId: client.client_id });
                dispatch({ type: 'seek', tS: Math.floor(window.start_s / stepS) * stepS });
                dispatch({ type: 'setPlaying', playing: false });
              }}
              className={cn(
                'flex w-full items-baseline gap-2 border-l-2 py-1.5 pl-2 pr-1 text-left transition-colors focus-visible:bg-white/[0.08] focus-visible:outline-none',
                active
                  ? 'border-zinc-200 bg-white/[0.06]'
                  : 'border-transparent hover:bg-white/[0.03]',
              )}
            >
              <span className="font-data text-[11px] tabular-nums text-zinc-200">
                {formatClock(window.start_s)}
              </span>
              <span className="font-data text-[10px] tabular-nums text-zinc-500">
                {formatDuration(window.duration_s)}
              </span>
              {(window.leading || window.trailing) && (
                <span
                  className="font-data text-[9px] tracking-[0.08em] text-zinc-600"
                  title="Touches the edge of the horizon, so its true length is unknown"
                >
                  EDGE
                </span>
              )}
              <span
                className={cn(
                  'ml-auto truncate font-label text-[10px]',
                  window.reason === 'no_visible_satellite' ? 'text-alarm' : 'text-zinc-500',
                )}
              >
                {window.reason ? NO_ROUTE_COPY[window.reason] : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="font-label text-[11px] leading-relaxed text-zinc-500">
        Longest gap {formatDuration(client.max_outage_s)}. Pick one to jump the
        timeline there and see how the site is connected at that moment.
      </p>
    </div>
  );
}
