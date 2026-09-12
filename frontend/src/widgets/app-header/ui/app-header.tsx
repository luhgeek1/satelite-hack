'use client';

import { Activity, BarChart3, Globe as GlobeIcon, ShieldAlert } from 'lucide-react';
import { ScenarioPicker } from '@/features/select-scenario';
import { useSession, type StudioTab } from '@/entities/session';
import { cn } from '@/shared/lib';

const TABS: Array<{ id: StudioTab; label: string; icon: typeof Activity }> = [
  { id: 'simulation', label: 'Simulation', icon: Activity },
  { id: 'resilience', label: 'Resilience', icon: ShieldAlert },
  { id: 'compare', label: 'Compare', icon: BarChart3 },
];

interface AppHeaderProps {
  status: 'ready' | 'running' | 'error' | 'idle';
}

const STATUS_COPY: Record<AppHeaderProps['status'], { label: string; tone: string }> = {
  ready: { label: 'READY', tone: 'text-zinc-300' },
  running: { label: 'SOLVING', tone: 'text-zinc-400' },
  error: { label: 'ERROR', tone: 'text-alarm' },
  idle: { label: 'IDLE', tone: 'text-zinc-600' },
};

export function AppHeader({ status }: AppHeaderProps) {
  const { state, dispatch } = useSession();
  const indicator = STATUS_COPY[status];

  return (
    <header className="relative z-40 grid h-14 flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-rule bg-black px-3 sm:gap-4 sm:px-6 lg:h-16">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-rule-strong">
          <GlobeIcon className="h-4 w-4 text-zinc-300" />
        </div>
        <div className="hidden min-w-0 sm:block">
          <h1 className="truncate font-label text-[14px] font-semibold leading-tight text-zinc-100">
            OrbitGuard
          </h1>
          <div className="hidden font-label text-[11px] leading-tight text-zinc-500 lg:block">
            Satellite resilience studio
          </div>
        </div>
      </div>

      <div className="flex h-9 flex-shrink-0 items-center border border-rule-strong">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => dispatch({ type: 'setTab', tab: id })}
            aria-pressed={state.tab === id}
            title={label}
            className={cn(
              'flex h-full items-center gap-2 border-l border-rule-strong px-2.5 font-label text-[13px] transition-colors first:border-l-0 focus-visible:bg-white/15 focus-visible:outline-none sm:px-4 lg:px-6',
              state.tab === id
                ? 'bg-white/[0.12] text-zinc-100'
                : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200',
            )}
          >
            <Icon size={14} className="md:hidden" />
            <span className="hidden md:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
        <ScenarioPicker />
        <div className="hidden items-center gap-1.5 font-data text-[10px] tracking-[0.08em] sm:flex">
          <span
            className={cn(
              'h-1.5 w-1.5',
              status === 'error' ? 'bg-alarm' : status === 'running' ? 'bg-zinc-400' : 'bg-zinc-600',
            )}
          />
          <span className={indicator.tone}>{indicator.label}</span>
        </div>
      </div>
    </header>
  );
}
