'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import { useSession } from '@/entities/session';
import { neighboursOf, type LinkView, type SatelliteView } from '@/entities/satellite';
import { RouteChain, tracesThrough, type RouteTrace } from '@/entities/simulation';
import { cn, criticalityLevel, formatClock, formatLatitude, formatLongitude, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { Button } from '@/shared/ui';

interface SatelliteDetailsProps {
  satellite: SatelliteView | undefined;
  links: LinkView[];
  routes: RouteTrace[];
  hasResilience: boolean;
  pending: boolean;
  /** Timeline position: a one-click failure starts here and runs to the end of the day. */
  currentTS: number;
  onInjectFailure: (satelliteId: string) => void;
  onRestore: (satelliteId: string) => void;
  placement?: 'overlay' | 'sidebar';
}

/** One curve for the whole panel, so nothing moves on a timing of its own. */
const EASE = [0.22, 0.61, 0.36, 1] as const;

export function SatelliteDetails({
  satellite,
  links,
  routes,
  hasResilience,
  pending,
  currentTS,
  onInjectFailure,
  onRestore,
  placement = 'overlay',
}: SatelliteDetailsProps) {
  const { dispatch } = useSession();
  const { t } = useI18n();
  const reduce = useReducedMotion();

  // The score counts up to its reading rather than appearing at it, which is
  // what makes the meter read as a measurement being taken.
  const score = useMotionValue(0);
  const settledScore = useSpring(score, { stiffness: 170, damping: 24, mass: 0.7 });
  const scoreLabel = useTransform(settledScore, (value) => Math.round(value));

  useEffect(() => {
    if (satellite) score.set(satellite.criticality);
  }, [satellite, score]);

  if (!satellite) return null;

  // One orchestrated entrance: the sections arrive in reading order, and
  // switching to another node replays it rather than cutting the content.
  const body = {
    hidden: {},
    shown: {
      transition: reduce ? {} : { staggerChildren: 0.04, delayChildren: 0.1 },
    },
    out: { opacity: 0, transition: { duration: reduce ? 0 : 0.1 } },
  };

  const section = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 6 },
    shown: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.24, ease: EASE } },
  };

  const level = criticalityLevel(satellite.criticality);
  const neighbours = neighboursOf(links, satellite.id);
  const carried = tracesThrough(routes, satellite.id);
  const accent = satellite.failed ? '#e4483a' : satellite.color;

  const telemetry = [
    { label: t('sat.plane'), value: satellite.planeId },
    { label: t('sat.batch'), value: `${satellite.launchBatch}` },
    { label: t('sat.altitude'), value: t('sat.km', { value: satellite.altitudeKm.toFixed(0) }) },
    { label: t('sat.latitude'), value: formatLatitude(satellite.lat) },
    { label: t('sat.longitude'), value: formatLongitude(satellite.lon) },
    { label: t('sat.links'), value: `${neighbours.length}` },
    {
      label: t('sat.traffic'),
      value: carried.length
        ? t('sat.trafficCount', { carried: carried.length, total: routes.length })
        : t('sat.trafficIdle'),
    },
  ];

  // The panel is a column of its own, pinned to the left edge of the data
  // column: the configuration stays readable beside it, and the reveal wipes
  // out from under that edge rather than flying in over the globe. Height
  // follows the content — a fixed full-height sheet would claim space the
  // readings do not need — and only a long node runs into the scroll. A
  // hairline gap on every side keeps it off the header, the timeline and
  // the column it belongs to, so it reads as a sheet over them.
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
          'absolute right-full top-2 z-20 mr-2 w-[320px] max-h-[calc(100%-1rem)] border border-rule-strong shadow-2xl',
      )}
    >
      <div className="flex items-center gap-3">
        <motion.span
          className="h-9 w-[3px] flex-shrink-0 origin-center"
          style={{ background: accent }}
          initial={reduce ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
        />
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={satellite.id}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: reduce ? 0 : 0.16, ease: EASE }}
            >
              <div className="font-data text-xl leading-none text-zinc-50">{satellite.id}</div>
              <div className={cn('mt-1.5 font-label text-[11px]', satellite.failed ? 'text-alarm' : 'text-zinc-400')}>
                {satellite.failed
                  ? t('sat.failed')
                  : satellite.deployed
                    ? t('sat.active')
                    : t('sat.notDeployed')}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'selectSatellite', satelliteId: null })}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-zinc-500 transition-colors hover:text-zinc-200"
          aria-label={t('sat.close')}
        >
          <X size={16} />
        </button>
      </div>

      <AnimatePresence mode="wait">
      <motion.div key={satellite.id} variants={body} initial="hidden" animate="shown" exit="out">

      <motion.div className="mt-5" variants={section}>
        {hasResilience ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-1">
                <motion.span
                  className="font-data text-[40px] leading-none tracking-tight tabular-nums"
                  style={{ color: level.color }}
                >
                  {reduce ? Math.round(satellite.criticality) : scoreLabel}
                </motion.span>
                <span className="font-data text-sm text-zinc-600">/100</span>
              </div>
              <div className="text-right leading-tight">
                <div className="font-label text-[11px] text-zinc-500">{t('sat.criticality')}</div>
                <div className="font-label text-[11px]" style={{ color: level.color }}>
                  {t(`criticality.${level.tier}` as 'criticality.low')}
                </div>
              </div>
            </div>

            <div className="mt-3 flex gap-[2px]" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, index) => (
                <motion.span
                  key={index}
                  className="h-3 flex-1 origin-bottom"
                  style={{
                    background:
                      ((index + 1) / 24) * 100 <= satellite.criticality ? level.color : '#27272a',
                  }}
                  initial={reduce ? false : { scaleY: 0.12, opacity: 0.35 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{
                    duration: reduce ? 0 : 0.3,
                    delay: reduce ? 0 : index * 0.012,
                    ease: EASE,
                  }}
                />
              ))}
            </div>

            <p className="mt-3 font-label text-xs leading-relaxed text-zinc-400">
              {satellite.failed
                ? t('sat.downCopy')
                : t('sat.costCopy', { amount: formatPercent(satellite.availabilityImpact) })}
            </p>
          </>
        ) : (
          <p className="font-label text-xs leading-relaxed text-zinc-500">
            {t('sat.scoreHint')}
          </p>
        )}
      </motion.div>

      <motion.dl className="mt-5 border-t border-rule" variants={section}>
        {telemetry.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
            <dt className="font-label text-xs text-zinc-500">{row.label}</dt>
            <dd className="font-data text-[13px] tabular-nums text-zinc-200">{row.value}</dd>
          </div>
        ))}
      </motion.dl>

      {carried.length > 0 && (
        <motion.div className="mt-4" variants={section}>
          <div className="font-label text-xs text-zinc-500">{t('sat.carrying')}</div>
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
                  <span className="text-zinc-600">{t('sat.hops', { count: trace.hops ?? 0 })}</span>
                </button>
                <RouteChain trace={trace} emphasize={satellite.id} className="mt-1 pl-3" />
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {neighbours.length > 0 && (
        <motion.div className="mt-4" variants={section}>
          <div className="font-label text-xs text-zinc-500">{t('sat.connects')}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {neighbours.map((id) => (
              <motion.button
                key={id}
                type="button"
                onClick={() => dispatch({ type: 'selectSatellite', satelliteId: id })}
                className="border border-rule-strong px-1.5 py-0.5 font-data text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                whileTap={reduce ? undefined : { scale: 0.94 }}
                transition={{ duration: 0.12, ease: EASE }}
              >
                {id}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div className="mt-6" variants={section}>
        <motion.div whileTap={reduce || pending ? undefined : { scale: 0.99 }}>
          {satellite.failed ? (
            <Button variant="outline" className="w-full" onClick={() => onRestore(satellite.id)}>
              {t('sat.restore')}
            </Button>
          ) : (
            <Button
              variant="danger"
              className="w-full"
              disabled={pending || !satellite.deployed}
              onClick={() => onInjectFailure(satellite.id)}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={pending ? 'pending' : 'idle'}
                  initial={reduce ? false : { opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: reduce ? 0 : 0.14, ease: EASE }}
                >
                  {pending ? t('sat.recomputing') : t('sat.simulate', { time: formatClock(currentTS) })}
                </motion.span>
              </AnimatePresence>
            </Button>
          )}
        </motion.div>
      </motion.div>

      </motion.div>
      </AnimatePresence>
    </motion.div>
  );

  // Exit is driven by the caller's AnimatePresence, so closing wipes out
  // instead of vanishing the moment the selection clears.
  return content;
}
