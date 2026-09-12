'use client';

import { cn, formatPercent, formatPoints } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ComparedMetric } from '@/shared/api';

interface MetricStripProps {
  metrics: ComparedMetric[];
  /** Denominator for the "clients meeting target" count, from the scenario. */
  clientCount: number;
}

/** Every metric the compare endpoint returns, on one line of tiles. */
export function MetricStrip({ metrics, clientCount }: MetricStripProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((metric) => (
        <MetricTile key={metric.key} metric={metric} clientCount={clientCount} />
      ))}
    </div>
  );
}

function MetricTile({ metric, clientCount }: { metric: ComparedMetric; clientCount: number }) {
  const { formatDuration } = useI18n();
  const [before, after] = metric.values;

  const format = (value: number | null) => {
    if (value === null) return '—';
    if (metric.unit === 'fraction') return formatPercent(value);
    if (metric.unit === 'seconds') return formatDuration(value);
    if (metric.unit === 'hops') return value.toFixed(2);
    if (metric.unit === 'count') return clientCount ? `${value}/${clientCount}` : String(value);
    return String(value);
  };

  const diff = before === null || after === null ? null : after - before;

  const delta = (() => {
    if (diff === null) return '—';
    if (metric.unit === 'fraction') return formatPoints(diff);
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
    const size = Math.abs(diff);
    if (metric.unit === 'seconds') return `${sign}${formatDuration(size)}`;
    if (metric.unit === 'hops') return `${sign}${size.toFixed(2)}`;
    return `${sign}${size}`;
  })();

  // Unchanged is its own answer: it should not be coloured like a regression.
  const verdict = diff === null || diff === 0 ? 'level' : metric.higher_is_better === (diff > 0) ? 'better' : 'worse';

  return (
    <div
      className={cn(
        'flex flex-col border border-rule-strong',
        '[&:last-child:nth-child(odd)]:col-span-2 sm:[&:last-child:nth-child(odd)]:col-span-1',
      )}
    >
      <div className="flex-1 px-3 pb-3 pt-2.5">
        <div className="font-label text-[11px] leading-tight text-zinc-500">{metric.label}</div>
        <div className="mt-1.5 font-data text-[22px] leading-none tabular-nums text-zinc-100">
          {format(after)}
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 border-t border-rule px-3 py-1.5">
        <span className="font-data text-[10.5px] tabular-nums text-zinc-500">
          <span className="text-zinc-700">A</span> {format(before)}
        </span>
        <span
          className={cn(
            'font-data text-[10.5px] tabular-nums',
            verdict === 'better' ? 'text-zinc-200' : verdict === 'worse' ? 'text-alarm' : 'text-zinc-600',
          )}
        >
          {delta}
        </span>
      </div>
    </div>
  );
}
