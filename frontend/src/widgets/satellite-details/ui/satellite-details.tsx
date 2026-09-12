'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSession } from '@/entities/session';
import { neighboursOf, type LinkView, type SatelliteView } from '@/entities/satellite';
import { cn, criticalityLevel, formatLatitude, formatLongitude, formatPercent } from '@/shared/lib';
import { Button } from '@/shared/ui';

interface SatelliteDetailsProps {
  satellite: SatelliteView | undefined;
  links: LinkView[];
  activeRoute: string[];
  hasResilience: boolean;
  pending: boolean;
  onInjectFailure: (satelliteId: string) => void;
  onRestore: (satelliteId: string) => void;
  placement?: 'overlay' | 'sidebar';
}

export function SatelliteDetails({
  satellite,
  links,
  activeRoute,
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
  const carriesRoute = activeRoute.includes(satellite.id);
  const accent = satellite.failed ? '#e4483a' : satellite.color;

  const telemetry = [
    { label: 'Plane', value: satellite.planeId },
    { label: 'Launch batch', value: `${satellite.launchBatch}` },
    { label: 'Altitude', value: `${satellite.altitudeKm.toFixed(0)} km` },
    { label: 'Latitude', value: formatLatitude(satellite.lat) },
    { label: 'Longitude', value: formatLongitude(satellite.lon) },
    { label: 'Inter-satellite links', value: `${neighbours.length}` },
    { label: 'Active route', value: carriesRoute ? 'Carrying' : 'Not in path' },
  ];

  const content = (
    <motion.div
      key={placement === 'overlay' ? `overlay-${satellite.id}` : 'sidebar-details'}
      initial={placement === 'overlay' ? { x: '100%' } : false}
      animate={placement === 'overlay' ? { x: 0 } : { opacity: 1 }}
      exit={placement === 'overlay' ? { x: '100%' } : { opacity: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 210 }}
      className={cn(
        'flex h-fit flex-col overflow-y-auto overscroll-contain bg-[#09090b] p-4',
        placement === 'overlay' && 'absolute inset-x-0 top-0 z-20 max-h-full border-l border-rule-strong shadow-2xl',
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

  return placement === 'overlay' ? <AnimatePresence>{content}</AnimatePresence> : content;
}
