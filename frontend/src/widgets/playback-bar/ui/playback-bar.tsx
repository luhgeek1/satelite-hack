'use client';

import { useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn, formatClock } from '@/shared/lib';
import type { OutageBand } from '@/entities/simulation';

interface PlaybackBarProps {
  tS: number;
  horizonS: number;
  stepS: number;
  playing: boolean;
  speed: number;
  bands: OutageBand[];
  focusClientId: string | null;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
  onSeek: (tS: number) => void;
}

const SPEEDS = [1, 4, 16];

export function PlaybackBar({
  tS,
  horizonS,
  stepS,
  playing,
  speed,
  bands,
  focusClientId,
  onToggle,
  onSpeed,
  onSeek,
}: PlaybackBarProps) {
  const track = useRef<HTMLDivElement>(null);

  const seekFromClientX = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(Math.floor((fraction * horizonS) / stepS) * stepS);
  };

  const visible = focusClientId ? bands.filter((band) => band.clientId === focusClientId) : bands;

  return (
    <div className="flex-shrink-0 border-t border-rule bg-black/90 px-3 py-2 backdrop-blur sm:px-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? 'Pause' : 'Play'}
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

        <div className="flex w-full min-w-0 basis-full items-center gap-2 sm:w-auto sm:flex-1 sm:basis-0">
          <span className="flex-shrink-0 font-data text-[10px] tabular-nums text-zinc-500">00:00</span>

          <div
            ref={track}
            role="slider"
            tabIndex={0}
            aria-label="Simulation time"
            aria-valuemin={0}
            aria-valuemax={horizonS}
            aria-valuenow={Math.round(tS)}
            aria-valuetext={`${formatClock(tS)} UTC`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              seekFromClientX(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) seekFromClientX(event.clientX);
            }}
            onKeyDown={(event) => {
              const nudge = event.shiftKey ? stepS * 10 : stepS;
              if (event.key === 'ArrowRight') onSeek(Math.min(horizonS - stepS, tS + nudge));
              if (event.key === 'ArrowLeft') onSeek(Math.max(0, tS - nudge));
              if (event.key === 'Home') onSeek(0);
              if (event.key === 'End') onSeek(horizonS - stepS);
            }}
            className="group relative h-4 min-w-0 flex-1 cursor-pointer touch-none focus:outline-none"
          >
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 ring-offset-2 ring-offset-black group-focus-visible:ring-1 group-focus-visible:ring-zinc-400">
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-zinc-600" />
              {visible.map((band, index) => (
                <div
                  key={`${band.clientId}-${index}`}
                  className={cn(
                    'absolute inset-y-0',
                    band.state === 'no_satellite' ? 'bg-alarm' : 'bg-zinc-400',
                  )}
                  style={{
                    left: `${band.startFraction * 100}%`,
                    width: `${Math.max(0.35, band.widthFraction * 100)}%`,
                  }}
                />
              ))}
            </div>

            <div
              className="pointer-events-none absolute top-1/2 h-3.5 w-[9px] -translate-x-1/2 -translate-y-1/2 border-l border-r border-white transition-[left] duration-75"
              style={{ left: `${(tS / horizonS) * 100}%` }}
            />
          </div>

          <span className="flex-shrink-0 font-data text-[10px] tabular-nums text-zinc-500">24:00</span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3 font-data text-[9px] tracking-[0.08em] text-zinc-600">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-2.5 bg-zinc-400" /> NO ROUTE
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-2.5 bg-alarm" /> NO SATELLITE
          </span>
        </div>
      </div>
    </div>
  );
}
