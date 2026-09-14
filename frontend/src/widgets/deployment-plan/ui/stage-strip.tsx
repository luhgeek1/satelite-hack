'use client';

import { outageBands, useAvailabilitySeries } from '@/entities/simulation';
import { cn } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { SimulationSummary } from '@/shared/api';









export function StageStrip({
  summary,
  loading,
}: {
  summary: SimulationSummary | undefined;
  loading: boolean;
}) {
  const { t } = useI18n();
  const series = useAvailabilitySeries(summary?.id);

  const bands = summary
    ? outageBands(series.data, summary.horizon_s, summary.step_s)
    : [];

  if (!summary || loading) {
    return <div className="mt-1 h-1.5 w-full animate-pulse bg-zinc-900" />;
  }

  return (
    <div
      className="relative mt-1 h-1.5 w-full overflow-hidden bg-zinc-700"
      role="img"
      aria-label={t('deploy.stripLabel')}
    >
      {bands.map((band, index) => (
        <div
          key={`${band.clientId}-${band.state}-${index}`}
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
  );
}
