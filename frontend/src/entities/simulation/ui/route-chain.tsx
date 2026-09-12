'use client';

import { useSession } from '@/entities/session';
import { cn } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { RouteTrace } from '../model/routes';

interface RouteChainProps {
  trace: RouteTrace;
  emphasize?: string | null;
  className?: string;
}

export function RouteChain({ trace, emphasize = null, className }: RouteChainProps) {
  const { dispatch } = useSession();
  const { t } = useI18n();

  if (!trace.available) {
    return (
      <div className={cn('font-data text-[11px] leading-relaxed text-zinc-500', className)}>
        {trace.reason ? t(`route.${trace.reason}` as 'route.none') : t('route.none')}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-x-1 gap-y-1', className)}>
      {trace.path.map((node, index) => {
        const isSatellite = index > 0 && index < trace.path.length - 1;
        const isEmphasized = node === emphasize;

        return (
          <span key={`${node}-${index}`} className="flex items-center gap-1">
            {index > 0 && <span className="font-data text-[10px] text-zinc-700">→</span>}
            <button
              type="button"
              disabled={!isSatellite}
              onClick={() => dispatch({ type: 'selectSatellite', satelliteId: node })}
              className={cn(
                'font-data text-[11px] leading-none transition-colors',
                isSatellite && 'hover:text-white',
                isEmphasized ? 'text-white underline underline-offset-2' : 'text-zinc-400',
                !isSatellite && 'cursor-default',
              )}
              style={index === 0 ? { color: isEmphasized ? undefined : trace.color } : undefined}
            >
              {node}
            </button>
          </span>
        );
      })}
    </div>
  );
}
