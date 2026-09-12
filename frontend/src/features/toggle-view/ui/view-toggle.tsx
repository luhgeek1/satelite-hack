'use client';

import { Globe as GlobeIcon } from 'lucide-react';
import { useSession, type ViewMode } from '@/entities/session';
import { cn } from '@/shared/lib';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { FlatMapIcon } from '@/shared/ui';

const modes: Array<{
  id: ViewMode;
  label: TranslationKey;
  title: TranslationKey;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: '3d', label: 'view.globe', title: 'view.globeTitle', icon: GlobeIcon },
  { id: '2d', label: 'view.map', title: 'view.mapTitle', icon: FlatMapIcon },
];

export function ViewToggle({ style }: { style?: React.CSSProperties }) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();

  return (
    <div
      style={style}
      className="absolute right-3 top-[3.25rem] z-20 flex border border-rule-strong bg-black/85 backdrop-blur lg:top-6"
    >
      {modes.map(({ id, label, title, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => dispatch({ type: 'setViewMode', viewMode: id })}
          aria-pressed={state.viewMode === id}
          title={t(title)}
          className={cn(
            'flex h-9 items-center gap-2 border-l border-rule-strong px-3.5 font-label text-[13px] transition-colors first:border-l-0 focus-visible:bg-white/15 focus-visible:text-zinc-100 focus-visible:outline-none',
            state.viewMode === id
              ? 'bg-white/[0.12] text-zinc-100'
              : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200',
          )}
        >
          <Icon size={15} />
          {t(label)}
        </button>
      ))}
    </div>
  );
}
