'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, Pause, Play, SquareDashedMousePointer, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  OutagePicker,
  windowClock,
  type OutageNode,
  type OutageTarget,
  type OutageWindow,
} from '@/features/schedule-outage';
import { playbackTickMs } from '@/features/timeline-playback';
import { cn, formatClock, formatPercent } from '@/shared/lib';
import { FeatureHint } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { OutageBand } from '@/entities/simulation';
import type { ClientMetrics } from '@/shared/api';

interface PlaybackBarProps {
  tS: number;
  horizonS: number;
  stepS: number;
  playing: boolean;
  speed: number;
  bands: OutageBand[];
  clients: ClientMetrics[];
  target: number;
  focusClientId: string | null;
  satelliteNodes: OutageNode[];
  gatewayNodes: OutageNode[];

  resetNonce: number;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
  onSeek: (tS: number) => void;
  onSelectClient: (clientId: string) => void;

  onScheduleOutage: (target: OutageTarget, window: OutageWindow, off: boolean) => void;

  onClearOutages: (window: OutageWindow) => void;
}


const SPEEDS = [0.5, 1, 4];

const HOUR_MARKS = [0, 6, 12, 18, 24];

const PICKER_HALF = '9.75rem';


type DragKind = { kind: 'new' } | { kind: 'edge'; edge: 'start' | 'end' } | { kind: 'move' };
type Drag = DragKind & {
  id: number;
  anchorS: number;
  base: OutageWindow;
  originX: number;

  openBefore: boolean;
};


type DrawnWindow = OutageWindow & { id: number };

let nextWindowId = 0;

function PlaybackBarView({
  tS,
  horizonS,
  stepS,
  playing,
  speed,
  bands,
  clients,
  target,
  focusClientId,
  satelliteNodes,
  gatewayNodes,
  resetNonce,
  onToggle,
  onSpeed,
  onSeek,
  onSelectClient,
  onScheduleOutage,
  onClearOutages,
}: PlaybackBarProps) {
  const { t, formatDuration } = useI18n();
  const reduce = useReducedMotion();
  const tracks = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const rowsBox = useRef<HTMLDivElement>(null);



  const [gutter, setGutter] = useState(0);

  useEffect(() => {
    const box = rowsBox.current;
    if (!box) return;
    const measure = () => setGutter(box.offsetWidth - box.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [clients.length]);




  const [selectMode, setSelectMode] = useState(false);


  const [windows, setWindows] = useState<DrawnWindow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [listing, setListing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);


  const active = windows.find((item) => item.id === activeId) ?? null;




  const bandsByClient = useMemo(() => {
    const grouped = new Map<string, OutageBand[]>();
    for (const band of bands) {
      const rows = grouped.get(band.clientId);
      if (rows) rows.push(band);
      else grouped.set(band.clientId, [band]);
    }
    return grouped;
  }, [bands]);

  const timeFromClientX = (clientX: number) => {
    const rect = tracks.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.max(0, Math.min(horizonS, Math.round((fraction * horizonS) / stepS) * stepS));
  };

  const seekFromClientX = (clientX: number) => {
    const rect = tracks.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(Math.floor((fraction * horizonS) / stepS) * stepS);
  };

  const startDrag = (event: React.PointerEvent, kind: DragKind, target?: DrawnWindow) => {
    const at = timeFromClientX(event.clientX);
    if (at === null) return;
    event.preventDefault();
    event.stopPropagation();
    moved.current = false;
    setPicking(false);

    if (kind.kind === 'new') {
      const drawn = { id: (nextWindowId += 1), startS: at, endS: at };
      setWindows((current) => [...current, drawn]);
      setActiveId(drawn.id);
      setDrag({
        ...kind,
        id: drawn.id,
        anchorS: at,
        base: drawn,
        originX: event.clientX,
        openBefore: false,
      });
      return;
    }

    if (!target) return;
    setActiveId(target.id);
    setDrag({
      ...kind,
      id: target.id,
      anchorS: at,
      base: target,
      originX: event.clientX,
      openBefore: picking && activeId === target.id,
    });
  };




  useEffect(() => {
    if (!drag) return;

    const reshape = (next: OutageWindow) =>
      setWindows((current) =>
        current.map((item) => (item.id === drag.id ? { ...item, ...next } : item)),
      );

    const onMove = (event: PointerEvent) => {
      const at = timeFromClientX(event.clientX);
      if (at === null) return;
      if (Math.abs(event.clientX - drag.originX) > 3) moved.current = true;

      const base = drag.base;

      if (drag.kind === 'new') {
        reshape({ startS: Math.min(drag.anchorS, at), endS: Math.max(drag.anchorS, at) });
        return;
      }

      if (drag.kind === 'edge') {
        const other = drag.edge === 'start' ? base.endS : base.startS;
        reshape({ startS: Math.min(other, at), endS: Math.max(other, at) });
        return;
      }

      const shift = Math.max(-base.startS, Math.min(horizonS - base.endS, at - drag.anchorS));
      reshape({ startS: base.startS + shift, endS: base.endS + shift });
    };

    const onUp = () => {
      setDrag(null);


      if (!moved.current) {
        if (drag.kind === 'new') {
          setWindows((current) => current.filter((item) => item.id !== drag.id));
          setActiveId(null);
          return;
        }


        setPicking(!drag.openBefore);
        return;
      }


      setSelectMode(false);
      setPicking(true);
    };

    globalThis.addEventListener('pointermove', onMove);
    globalThis.addEventListener('pointerup', onUp);
    return () => {
      globalThis.removeEventListener('pointermove', onMove);
      globalThis.removeEventListener('pointerup', onUp);
    };

  }, [drag, horizonS, stepS]);

  useEffect(() => {
    if (!listing) return;
    const onPointerDown = (event: PointerEvent) => {
      if (chip.current?.contains(event.target as Node)) return;
      setListing(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [listing]);



  useEffect(() => {
    if (!picking) return;
    const onPointerDown = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      setPicking(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [picking]);



  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable]')) return;
      event.preventDefault();
      onToggle();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onToggle]);

  useEffect(() => {
    if (resetNonce === 0) return;
    setWindows([]);
    setActiveId(null);
    setPicking(false);
    setListing(false);
  }, [resetNonce]);




  const dropWindow = (id: number) => {
    const target = windows.find((item) => item.id === id);
    if (target) onClearOutages(target);
    setWindows((current) => current.filter((item) => item.id !== id));
    setPicking(false);
    setActiveId((current) => (current === id ? null : current));
  };



  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (picking) setPicking(false);
      else dropWindow(active.id);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);

  }, [active, picking]);

  const clearWindows = () => {
    windows.forEach(onClearOutages);
    setWindows([]);
    setActiveId(null);
    setPicking(false);
    setListing(false);
  };

  const cursor = horizonS ? (tS / horizonS) * 100 : 0;


  const glideMs = Math.min(260, Math.round(playbackTickMs(stepS, horizonS, speed)));
  const placeOf = (item: OutageWindow) => ({
    left: (item.startS / horizonS) * 100,
    width: ((item.endS - item.startS) / horizonS) * 100,
  });
  const activePlace = active && horizonS ? placeOf(active) : null;





  const legend = [
    { key: 'playback.routed' as const, tone: 'bg-zinc-700' },
    { key: 'playback.noRoute' as const, tone: 'bg-zinc-400' },
    { key: 'playback.noSatellite' as const, tone: 'bg-zinc-100' },
  ];

  return (
    <div
      ref={root}
      onContextMenu={(event) => {



        if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault();
      }}


      className="relative z-30 flex-shrink-0 select-none border-t border-rule bg-black/90 px-3 py-2 backdrop-blur sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? t('playback.pause') : t('playback.play')}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center border border-rule-strong text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white focus-visible:border-zinc-300 focus-visible:outline-none"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <div className="flex flex-shrink-0 items-center border border-rule-strong">
          {SPEEDS.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => onSpeed(rate)}
              aria-pressed={speed === rate}
              className={cn(
                'h-6 border-l border-rule-strong px-2 font-data text-[11px] tabular-nums transition-colors first:border-l-0 focus-visible:bg-white/15 focus-visible:outline-none',
                speed === rate
                  ? 'bg-white/[0.12] text-zinc-100'
                  : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200',
              )}
            >
              x{rate}
            </button>
          ))}
        </div>

        <div className="flex flex-shrink-0 items-baseline gap-1 font-data text-sm tabular-nums text-zinc-100">
          {formatClock(tS)}
          <span className="text-[10px] text-zinc-500">UTC</span>
        </div>

        <div className="hidden h-5 w-px flex-shrink-0 bg-rule-strong sm:block" />

        <FeatureHint
          title={t('window.tipTitle')}
          text={t('window.hint')}
          className="flex-shrink-0"
        >
          <button
            type="button"
            data-tour="window-tool"
            onClick={() => setSelectMode((current) => !current)}
            aria-pressed={selectMode}
            className={cn(
              'flex h-6 items-center gap-1.5 border px-2 font-label text-[11px] transition-colors focus-visible:outline-none',
              selectMode
                ? 'border-alarm/60 bg-alarm/10 text-alarm'
                : 'border-rule-strong text-zinc-500 hover:border-zinc-600 hover:text-zinc-200',
            )}
          >
            <SquareDashedMousePointer size={12} />
            <span className="hidden sm:inline">{t('window.label')}</span>
          </button>
        </FeatureHint>

        {windows.length > 0 && (
          <span ref={chip} className="relative flex h-6 flex-shrink-0 items-center border border-alarm/40 bg-alarm/[0.07] font-data text-[10px] tabular-nums text-alarm">
            <button
              type="button"
              onClick={() => setListing((current) => !current)}
              aria-expanded={listing}
              title={t('window.list')}
              className="flex h-full items-center gap-1.5 px-2 transition-colors hover:bg-alarm/10 focus-visible:bg-alarm/10 focus-visible:outline-none"
            >
              {windows.length === 1 ? (
                <>
                  {windowClock(windows[0].startS, horizonS, formatClock)}
                  <span className="text-alarm/60">&rarr;</span>
                  {windowClock(windows[0].endS, horizonS, formatClock)}
                </>
              ) : (


                <>
                  <SquareDashedMousePointer size={11} className="text-alarm/70" aria-hidden="true" />
                  {windows.length}
                </>
              )}
              <ChevronUp
                size={10}
                className={cn('text-alarm/60 transition-transform', !listing && 'rotate-180')}
              />
            </button>

            <button
              type="button"
              onClick={clearWindows}
              aria-label={t('window.clearAll')}
              title={t('window.clearAll')}
              className="flex h-full w-6 items-center justify-center border-l border-alarm/25 text-alarm/70 transition-colors hover:text-alarm focus-visible:text-alarm focus-visible:outline-none"
            >
              <Trash2 size={11} />
            </button>

            <AnimatePresence>
              {listing && (
                <motion.ul
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: 2 }}
                  transition={{ duration: reduce ? 0 : 0.14, ease: 'easeOut' }}
                  className="absolute bottom-full left-1/2 z-40 mb-1.5 w-[10.5rem] -translate-x-1/2 border border-rule-strong bg-black shadow-2xl"
                >
                  {[...windows]
                    .sort((a, b) => a.startS - b.startS)
                    .map((item) => (
                      <li key={item.id} className="flex items-center border-b border-rule last:border-b-0">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(item.id);
                            setPicking(true);
                            setListing(false);
                          }}
                          className="flex flex-1 items-center gap-1.5 py-1.5 pl-2 text-left font-data text-[10px] tabular-nums text-zinc-300 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none"
                        >
                          {windowClock(item.startS, horizonS, formatClock)}
                          <span className="text-zinc-600">&rarr;</span>
                          {windowClock(item.endS, horizonS, formatClock)}
                        </button>
                        <button
                          type="button"
                          onClick={() => dropWindow(item.id)}
                          aria-label={t('window.remove')}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-zinc-600 transition-colors hover:text-alarm focus-visible:text-alarm focus-visible:outline-none"
                        >
                          <X size={10} />
                        </button>
                      </li>
                    ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </span>
        )}




        <span className="hidden items-baseline gap-2 sm:flex">
          <span className="font-label text-[12px] text-zinc-500">{t('playback.day')}</span>
          <span className="hidden font-data text-[10px] tabular-nums text-zinc-600 2xl:inline">
            {t('health.target')} &ge; {formatPercent(target, 0)}
          </span>
        </span>

        <div className="ml-auto hidden items-center gap-3 font-data text-[9px] tracking-[0.08em] text-zinc-600 2xl:flex">
          {legend.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-2.5 border border-rule-strong', item.tone)} /> {t(item.key)}
            </span>
          ))}
        </div>
      </div>




      <div
        role="slider"
        tabIndex={0}
        aria-label={t('playback.time')}
        aria-valuemin={0}
        aria-valuemax={horizonS}
        aria-valuenow={Math.round(tS)}
        aria-valuetext={`${formatClock(tS)} UTC`}
        onKeyDown={(event) => {
          const nudge = event.shiftKey ? stepS * 10 : stepS;
          if (event.key === 'ArrowRight') onSeek(Math.min(horizonS - stepS, tS + nudge));
          if (event.key === 'ArrowLeft') onSeek(Math.max(0, tS - nudge));
          if (event.key === 'Home') onSeek(0);
          if (event.key === 'End') onSeek(horizonS - stepS);
        }}




        onPointerDown={(event) => {
          if (event.button !== 0 || selectMode) return;
          const target = event.target as HTMLElement;
          if (target.closest('button') || target.closest('[data-track]') || target.closest('[data-window]')) {
            return;
          }


          const rect = tracks.current?.getBoundingClientRect();
          if (!rect || event.clientX < rect.left || event.clientX > rect.right) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromClientX(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!drag && event.buttons === 1 && !selectMode) {
            const target = event.target as HTMLElement;
            if (!target.closest('[data-window]')) seekFromClientX(event.clientX);
          }
        }}


        className="relative -mb-2 pb-2 pt-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
      >
        <div
          className="grid grid-cols-[2.6rem_1fr_2.9rem] items-center gap-x-2"
          style={{ paddingRight: gutter }}
        >
          <span aria-hidden="true" />
          <div className="relative h-3" aria-hidden="true">
            {HOUR_MARKS.map((hour) => {
              const at = (hour / 24) * 100;
              return (
                <span
                  key={hour}
                  className={cn(
                    'absolute top-0 font-data text-[9px] tabular-nums text-zinc-600',
                    hour === 0 && 'left-0',
                    hour === 24 && 'right-0',
                  )}
                  style={hour === 0 || hour === 24 ? undefined : { left: `${at}%`, transform: 'translateX(-50%)' }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              );
            })}
          </div>
          <span aria-hidden="true" />
        </div>




        <div
          className="pointer-events-none absolute inset-x-0 top-6 z-30 grid h-0 grid-cols-[2.6rem_1fr_2.9rem] gap-x-2"
          style={{ paddingRight: gutter }}
        >
          <div className="relative" style={{ gridColumn: 2 }}>
            {windows.map((item) => {
              if (drag?.id !== item.id) return null;
              const place = placeOf(item);
              return (
                <span
                  key={item.id}
                  className="absolute -top-5 -translate-x-1/2 whitespace-nowrap border border-alarm/40 bg-black px-1 font-data text-[9px] tabular-nums text-alarm"
                  style={{ left: `${place.left + place.width / 2}%` }}
                >
                  {formatDuration(item.endS - item.startS)}
                </span>
              );
            })}

            <AnimatePresence>
              {picking && active && activePlace && (
                <motion.div
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.99 }}
                  transition={{ duration: reduce ? 0 : 0.16, ease: 'easeOut' }}
                  style={{
                    left: `clamp(${PICKER_HALF}, ${activePlace.left + activePlace.width / 2}%, calc(100% - ${PICKER_HALF}))`,
                    transformOrigin: 'bottom center',
                  }}
                  className="pointer-events-auto absolute bottom-full mb-2 w-[19.5rem] -translate-x-1/2"
                >
                  <OutagePicker
                    window={active}
                    horizonS={horizonS}
                    satellites={satelliteNodes}
                    gateways={gatewayNodes}
                    onToggle={(target, off) => onScheduleOutage(target, active, off)}
                    onRemove={() => dropWindow(active.id)}
                    onClose={() => setPicking(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>



        <div ref={rowsBox} className="max-h-[9.5rem] overflow-y-auto overscroll-contain pt-1">
          <div className="grid grid-cols-[2.6rem_1fr_2.9rem] items-center gap-x-2 gap-y-1">



            <div


              className="pointer-events-none relative z-10 self-stretch"
              style={{ gridColumn: 2, gridRow: `1 / span ${Math.max(1, clients.length)}` }}
            >
              {windows.map((item) => {
                const place = placeOf(item);
                const current = item.id === activeId;

                return (
                  <div
                    key={item.id}
                    data-window=""
                    onPointerDown={(event) => {
                      if (event.button === 0 || event.button === 2) startDrag(event, { kind: 'move' }, item);
                    }}
                    className={cn(
                      'pointer-events-auto absolute -top-1 bottom-0 cursor-grab border-x transition-colors active:cursor-grabbing',
                      current ? 'z-[2] border-alarm/70 bg-alarm/[0.18]' : 'border-alarm/35 bg-alarm/[0.1]',
                    )}
                    style={{ left: `${place.left}%`, width: `${place.width}%` }}
                  >
                    <span className={cn('absolute inset-x-0 top-0 h-px', current ? 'bg-alarm/50' : 'bg-alarm/25')} />
                    <span className={cn('absolute inset-x-0 bottom-0 h-px', current ? 'bg-alarm/50' : 'bg-alarm/25')} />

                    {(['start', 'end'] as const).map((edge) => (
                      <span
                        key={edge}
                        role="presentation"
                        onPointerDown={(event) => {
                          if (event.button === 0 || event.button === 2) {
                            startDrag(event, { kind: 'edge', edge }, item);
                          }
                        }}
                        className={cn(
                          'absolute inset-y-0 flex w-3 cursor-ew-resize items-center justify-center',
                          edge === 'start' ? '-left-1.5' : '-right-1.5',
                        )}
                      >
                        <span className={cn('h-full w-[3px]', current ? 'bg-alarm' : 'bg-alarm/60')} />
                      </span>
                    ))}
                  </div>
                );
              })}

              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-1 bottom-0 w-[9px] -translate-x-1/2"
                style={{
                  left: `${cursor}%`,
                  transition: `left ${playing ? glideMs : 75}ms linear`,
                }}
              >
                {(['left-0', 'right-0'] as const).map((edge) => (
                  <span
                    key={edge}
                    className={cn('absolute inset-y-0 w-px bg-white', edge)}
                    style={{ boxShadow: '1px 0 0 rgba(0,0,0,0.85), -1px 0 0 rgba(0,0,0,0.85)' }}
                  />
                ))}
              </div>

            </div>

            {clients.map((client, index) => {
              const focused = client.client_id === focusClientId;
              const rows = bandsByClient.get(client.client_id) ?? [];

              return (
                <div key={client.client_id} className="contents">
                  <button
                    type="button"
                    onClick={() => onSelectClient(client.client_id)}
                    title={t('playback.focusClient', { client: client.client_id })}
                    className={cn(
                      'text-left font-data text-[11px] transition-colors focus-visible:outline-none',
                      focused ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
                    )}
                    style={{ gridColumn: 1, gridRow: index + 1 }}
                  >
                    {client.client_id}
                  </button>

                  <div
                    ref={index === 0 ? tracks : undefined}
                    data-track=""
                    onPointerDown={(event) => {



                      if (event.button === 2 || (event.button === 0 && selectMode)) {
                        startDrag(event, { kind: 'new' });
                        return;
                      }
                      if (event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      onSelectClient(client.client_id);
                      seekFromClientX(event.clientX);
                    }}
                    onPointerMove={(event) => {
                      if (!drag && event.buttons === 1) seekFromClientX(event.clientX);
                    }}


                    className={cn(
                      'relative h-2.5 touch-none overflow-hidden',
                      selectMode ? 'cursor-crosshair' : 'cursor-pointer',
                    )}
                    style={{ gridColumn: 2, gridRow: index + 1 }}
                  >
                    <div className="absolute inset-0 bg-zinc-700" />
                    {rows.map((band, bandIndex) => (
                      <div
                        key={`${band.state}-${bandIndex}`}
                        title={`${client.client_id} · ${formatClock(band.startFraction * horizonS)} · ${
                          band.state === 'no_satellite'
                            ? t('playback.bandNoSatellite')
                            : t('playback.bandNoRoute')
                        }`}
                        className={cn(
                          'absolute inset-y-0',
                          band.state === 'no_satellite' ? 'bg-zinc-100' : 'bg-zinc-400',
                        )}
                        style={{
                          left: `${band.startFraction * 100}%`,
                          width: `${Math.max(0.35, band.widthFraction * 100)}%`,
                        }}
                      />
                    ))}
                  </div>

                  <span
                    className={cn(
                      'text-right font-data text-[11px] tabular-nums',
                      client.meets_target ? 'text-zinc-300' : 'text-alarm',
                    )}
                    style={{ gridColumn: 3, gridRow: index + 1 }}
                  >
                    {formatPercent(client.availability)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}






export const PlaybackBar = memo(PlaybackBarView);
