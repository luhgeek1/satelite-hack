'use client';

import { useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn, formatClock, formatPercent } from '@/shared/lib';
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
  onToggle: () => void;
  onSpeed: (speed: number) => void;
  onSeek: (tS: number) => void;
  onSelectClient: (clientId: string) => void;
}

const SPEEDS = [1, 4, 16];
/** Every sixth hour gets a label; the ruler is read, not measured. */
const HOUR_MARKS = [0, 6, 12, 18, 24];

export function PlaybackBar({
  tS,
  horizonS,
  stepS,
  playing,
  speed,
  bands,
  clients,
  target,
  focusClientId,
  onToggle,
  onSpeed,
  onSeek,
  onSelectClient,
}: PlaybackBarProps) {
  const { t } = useI18n();
  const tracks = useRef<HTMLDivElement>(null);

  const seekFromClientX = (clientX: number) => {
    const rect = tracks.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(Math.floor((fraction * horizonS) / stepS) * stepS);
  };

  const cursor = horizonS ? (tS / horizonS) * 100 : 0;

  /**
   * A day that holds a route is the quiet state; what the eye should catch is
   * where it breaks, and the brighter the band the worse the break.
   */
  const legend = [
    { key: 'playback.routed' as const, tone: 'bg-zinc-700' },
    { key: 'playback.noRoute' as const, tone: 'bg-zinc-400' },
    { key: 'playback.noSatellite' as const, tone: 'bg-zinc-100' },
  ];

  return (
    <div className="flex-shrink-0 border-t border-rule bg-black/90 px-3 py-2 backdrop-blur sm:px-4">
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

        <span className="hidden items-baseline gap-2 sm:flex">
          <span className="font-label text-[12px] text-zinc-500">{t('playback.day')}</span>
          <span className="font-data text-[10px] tabular-nums text-zinc-600">
            {t('health.target')} &ge; {formatPercent(target, 0)}
          </span>
        </span>

        <div className="ml-auto flex items-center gap-3 font-data text-[9px] tracking-[0.08em] text-zinc-600">
          {legend.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-2.5 border border-rule-strong', item.tone)} /> {t(item.key)}
            </span>
          ))}
        </div>
      </div>

      {/* One row per ground site, sharing a single ruler and a single cursor:
          the question is always "which site loses the gateway, and when", and
          three separate strips answer it in one glance. */}
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
        className="mt-2 grid grid-cols-[2.6rem_1fr_2.9rem] items-center gap-x-2 gap-y-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
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

        {/* The cursor spans the rows rather than repeating in each one, so the
            same instant is one line down the whole stack. */}
        <div
          aria-hidden="true"
          // Stretched on purpose: the grid centres its items, and a centred
          // overlay collapses to nothing instead of covering the rows.
          className="pointer-events-none relative z-10 self-stretch"
          style={{ gridColumn: 2, gridRow: `2 / span ${Math.max(1, clients.length)}` }}
        >
          <div
            className="absolute -top-1 bottom-0 w-[9px] -translate-x-1/2 transition-[left] duration-75"
            style={{ left: `${cursor}%` }}
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
          const rows = bands.filter((band) => band.clientId === client.client_id);

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
                style={{ gridColumn: 1, gridRow: index + 2 }}
              >
                {client.client_id}
              </button>

              <div
                ref={index === 0 ? tracks : undefined}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onSelectClient(client.client_id);
                  seekFromClientX(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (event.buttons === 1) seekFromClientX(event.clientX);
                }}
                // All three rows are readings, so none of them is dimmed to
                // mark focus — the id beside the bar does that.
                className="relative h-2.5 cursor-pointer touch-none overflow-hidden"
                style={{ gridColumn: 2, gridRow: index + 2 }}
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
                style={{ gridColumn: 3, gridRow: index + 2 }}
              >
                {formatPercent(client.availability)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
