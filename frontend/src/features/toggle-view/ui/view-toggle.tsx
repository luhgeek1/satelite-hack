'use client';

import { Globe as GlobeIcon, Map as MapIcon } from 'lucide-react';
import { useSession, type ViewMode } from '@/entities/session';
import { cn } from '@/shared/lib';

const modes: Array<{ id: ViewMode; label: string; icon: typeof GlobeIcon }> = [
  { id: '3d', label: 'Globe', icon: GlobeIcon },
  { id: '2d', label: 'Map', icon: MapIcon },
];

export function ViewToggle({ style }: { style?: React.CSSProperties }) {
  const { state, dispatch } = useSession();

  return (
    <div
      style={style}
      className="absolute right-3 top-[3.25rem] z-20 flex border border-rule-strong bg-black/85 backdrop-blur lg:top-6"
    >
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => dispatch({ type: 'setViewMode', viewMode: id })}
          aria-pressed={state.viewMode === id}
          title={`${label} view`}
          className={cn(
            'flex h-9 items-center gap-2 border-l border-rule-strong px-3.5 font-label text-[13px] transition-colors first:border-l-0 focus-visible:bg-white/15 focus-visible:text-zinc-100 focus-visible:outline-none',
            state.viewMode === id
              ? 'bg-white/[0.12] text-zinc-100'
              : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200',
          )}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}
