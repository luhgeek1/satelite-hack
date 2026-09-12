'use client';

import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useSession } from '@/entities/session';
import { neighboursOf, type LinkView, type SatelliteView } from '@/entities/satellite';
import { RouteChain, tracesThrough, type RouteTrace } from '@/entities/simulation';
import { cn, criticalityLevel, formatLatitude, formatLongitude, formatPercent } from '@/shared/lib';
import { Button } from '@/shared/ui';

interface SatelliteDetailsProps {
  satellite: SatelliteView | undefined;
  links: LinkView[];
  routes: RouteTrace[];
  hasResilience: boolean;
  pending: boolean;
  onInjectFailure: (satelliteId: string) => void;
  onRestore: (satelliteId: string) => void;
  placement?: 'overlay' | 'sidebar';
}

export function SatelliteDetails({
  satellite,
  links,
  routes,
  hasResilience,
  pending,
  onInjectFailure,
  onRestore,
  placement = 'overlay',
}: SatelliteDetailsProps) {
  const { dispatch } = useSession();

  if (!satellite) return null;

  const level = criticalityLevel(satellite.criticality);
  const neighbours = neighboursOf(links, satellite.id);
  const carried = tracesThrough(routes, satellite.id);
  const accent = satellite.failed ? '#e4483a' : satellite.color;

  const telemetry = [
    { label: 'Plane', value: satellite.planeId },
    { label: 'Launch batch', value: `${satellite.launchBatch}` },
    { label: 'Altitude', value: `${satellite.altitudeKm.toFixed(0)} km` },
    { label: 'Latitude', value: formatLatitude(satellite.lat) },
    { label: 'Longitude', value: formatLongitude(satellite.lon) },
    { label: 'Inter-satellite links', value: `${neighbours.length}` },
    {
      label: 'Traffic',
      value: carried.length ? `${carried.length} of ${routes.length}` : 'Idle',
    },
  ];

  // The panel is a column of its own, pinned to the left edge of the data
  // column: the configuration stays readable beside it, and the reveal wipes
  // out from under that edge rather than flying in over the globe. Height
  // follows the content — a fixed full-height sheet would claim space the
  // readings do not need — and only a long node runs into the scroll.
  const content = (
    <motion.div
      key="satellite-details"
      initial={placement === 'overlay' ? { opacity: 0, clipPath: 'inset(0 0 0 100%)' } : false}
      animate={placement === 'overlay' ? { opacity: 1, clipPath: 'inset(0 0 0 0%)' } : { opacity: 1 }}
      exit={placement === 'overlay' ? { opacity: 0, clipPath: 'inset(0 0 0 100%)' } : { opacity: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={cn(
        'flex h-fit flex-col overflow-y-auto overscroll-contain bg-[#09090b] p-4',
        placement === 'overlay' &&
          'absolute right-full top-0 z-20 w-[320px] max-h-full border-b border-l border-rule-strong shadow-2xl',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="h-9 w-[3px] flex-shrink-0" style={{ background: accent }} />
        <div className="min-w-0 flex-1">
          <div className="font-data text-xl leading-none text-zinc-50">{satellite.id}</div>
          <div className={cn('mt-1.5 font-label text-[11px]', satellite.failed ? 'text-alarm' : 'text-zinc-400')}>
            {satellite.failed ? 'Failed' : satellite.deployed ? 'Active' : 'Not deployed'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'selectSatellite', satelliteId: null })}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-zinc-500 transition-colors hover:text-zinc-200"
          aria-label="Close satellite details"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-5">
        {hasResilience ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-1">
                <span
                  className="font-data text-[40px] leading-none tracking-tight tabular-nums"
                  style={{ color: level.color }}
                >
                  {Math.round(satellite.criticality)}
                </span>
                <span className="font-data text-sm text-zinc-600">/100</span>
              </div>
              <div className="text-right leading-tight">
                <div className="font-label text-[11px] text-zinc-500">Criticality</div>
                <div className="font-label text-[11px]" style={{ color: level.color }}>
                  {level.label}
                </div>
              </div>
            </div>

            <div className="mt-3 flex gap-[2px]" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, index) => (
                <span
                  key={index}
                  className="h-3 flex-1"
                  style={{
                    background:
                      ((index + 1) / 24) * 100 <= satellite.criticality ? level.color : '#27272a',
                  }}
                />
              ))}
            </div>

            <p className="mt-3 font-label text-xs leading-relaxed text-zinc-400">
              {satellite.failed
                ? 'This node is down. Links through it are cut until you restore it.'
                : `Losing this node costs ${formatPercent(satellite.availabilityImpact)} of the worst-served client's availability.`}
            </p>
          </>
        ) : (
          <p className="font-label text-xs leading-relaxed text-zinc-500">
            Open the Resilience tab to score how much this node carries.
          </p>
        )}
      </div>

      <dl className="mt-5 border-t border-rule">
        {telemetry.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
            <dt className="font-label text-xs text-zinc-500">{row.label}</dt>
            <dd className="font-data text-[13px] tabular-nums text-zinc-200">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <div className="font-label text-xs text-zinc-500">Carrying right now</div>
        {carried.length === 0 ? (
          <p className="mt-2 font-label text-[11px] leading-relaxed text-zinc-600">
            No client route runs through this node at this instant. It still counts as spare
            capacity — fail it and watch whether anything moves.
          </p>
        ) : (
          <div className="mt-2 space-y-2.5">
            {carried.map((trace) => (
              <div key={trace.clientId}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'selectClient', clientId: trace.clientId })}
                  className="flex items-center gap-1.5 font-data text-[11px] text-zinc-300 transition-colors hover:text-white"
                >
                  <span className="h-1.5 w-1.5 shrink-0" style={{ background: trace.color }} />
                  {trace.clientId}
                  <span className="text-zinc-600">{trace.hops} hops</span>
                </button>
                <RouteChain trace={trace} emphasize={satellite.id} className="mt-1 pl-3" />
              </div>
            ))}
          </div>
        )}
      </div>

      {neighbours.length > 0 && (
        <div className="mt-4">
          <div className="font-label text-xs text-zinc-500">Connects to</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {neighbours.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => dispatch({ type: 'selectSatellite', satelliteId: id })}
                className="border border-rule-strong px-1.5 py-0.5 font-data text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {satellite.failed ? (
          <Button variant="outline" className="w-full" onClick={() => onRestore(satellite.id)}>
            Restore node
          </Button>
        ) : (
          <Button
            variant="danger"
            className="w-full"
            disabled={pending || !satellite.deployed}
            onClick={() => onInjectFailure(satellite.id)}
          >
            {pending ? 'Recomputing…' : 'Simulate failure'}
          </Button>
        )}
      </div>
    </motion.div>
  );

  // Exit is driven by the caller's AnimatePresence, so closing wipes out
  // instead of vanishing the moment the selection clears.
  return content;
}
