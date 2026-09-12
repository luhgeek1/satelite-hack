'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { VariantSelect } from '@/features/manage-variants';
import { useComparison, useVariants } from '@/entities/variant';
import { cn, formatDuration, formatPercent, formatPoints } from '@/shared/lib';
import { EmptyState, ErrorNote } from '@/shared/ui';
import type { ComparedMetric } from '@/shared/api';

const SERIES_INK = ['#6b6b72', '#d9d9de'];

export function CompareBoard() {
  const variants = useVariants();
  const [slots, setSlots] = useState<[string | null, string | null]>([null, null]);

  const resolved = useMemo(
    () => slots.map((id) => variants.data?.find((variant) => variant.id === id)),
    [slots, variants.data],
  );

  const selectedIds = slots.filter((id): id is string => Boolean(id));
  const comparison = useComparison(selectedIds.length === 2 ? selectedIds : []);

  const chartData = useMemo(() => {
    const perClient = comparison.data?.per_client_availability;
    if (!perClient) return [];

    return Object.entries(perClient).map(([clientId, values]) => ({
      client: clientId,
      a: Number((values[0] * 100).toFixed(2)),
      b: Number((values[1] * 100).toFixed(2)),
    }));
  }, [comparison.data]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-black p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8">
        <div className="flex items-stretch gap-3 sm:gap-4">
          <VariantSelect
            slot="A"
            value={resolved[0]}
            exclude={slots[1] ?? undefined}
            onSelect={(id) => setSlots(([, b]) => [id, b])}
          />
          <div className="flex flex-shrink-0 items-center font-data text-[10px] tracking-[0.08em] text-zinc-600">
            VS
          </div>
          <VariantSelect
            slot="B"
            value={resolved[1]}
            exclude={slots[0] ?? undefined}
            lead
            onSelect={(id) => setSlots(([a]) => [a, id])}
          />
        </div>

        {variants.data?.length === 0 && (
          <div className="border border-rule-strong">
            <EmptyState
              title="Nothing saved to compare yet"
              hint="Configure the network on the Simulation tab and save it as a variant, then save a second one."
            />
          </div>
        )}

        {comparison.isError && <ErrorNote error={comparison.error} />}

        {comparison.data && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              {comparison.data.metrics.slice(0, 3).map((metric) => (
                <MetricTile key={metric.key} metric={metric} />
              ))}
            </div>

            {comparison.data.changed_parameters.length > 0 && (
              <div className="border border-rule-strong">
                <div className="border-b border-rule px-4 py-2.5 font-label text-[13px] text-zinc-300">
                  Changed parameters
                </div>
                {comparison.data.changed_parameters.map((diff) => (
                  <div
                    key={diff.path}
                    className="flex items-baseline gap-3 border-b border-rule px-4 py-2 last:border-b-0"
                  >
                    <span className="font-label text-[12px] text-zinc-400">{diff.label}</span>
                    <span className="ml-auto font-data text-[11px] tabular-nums text-zinc-600">
                      {String(diff.values[0] ?? '—')}
                    </span>
                    <span className="font-data text-[11px] text-zinc-700">→</span>
                    <span className="font-data text-[12px] tabular-nums text-zinc-100">
                      {String(diff.values[1] ?? '—')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-rule-strong p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                <h3 className="font-label text-[13px] text-zinc-300">Availability by ground site</h3>
                <div className="flex items-center gap-4">
                  {[
                    { label: resolved[0]?.name ?? 'A', ink: SERIES_INK[0], dash: '4 3' },
                    { label: resolved[1]?.name ?? 'B', ink: SERIES_INK[1], dash: undefined },
                  ].map((series) => (
                    <div key={series.label} className="flex items-center gap-1.5">
                      <svg width="16" height="2" aria-hidden="true">
                        <line
                          x1="0"
                          y1="1"
                          x2="16"
                          y2="1"
                          stroke={series.ink}
                          strokeWidth="2"
                          strokeDasharray={series.dash}
                        />
                      </svg>
                      <span className="truncate font-label text-[12px] text-zinc-400">{series.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 h-48 sm:h-56 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#1f1f23" vertical={false} />
                    <XAxis
                      dataKey="client"
                      stroke="#3f3f46"
                      tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                      tickMargin={8}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      stroke="#3f3f46"
                      tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                      width={40}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                      contentStyle={{
                        backgroundColor: '#000',
                        border: '1px solid #2e2e34',
                        borderRadius: 0,
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontSize: 11,
                      }}
                      labelStyle={{ color: '#a1a1aa', marginBottom: 4, fontSize: 11 }}
                      formatter={(value: unknown, name: unknown) => [
                        `${value}%`,
                        name === 'a' ? (resolved[0]?.name ?? 'A') : (resolved[1]?.name ?? 'B'),
                      ]}
                    />
                    <ReferenceLine
                      y={(resolved[0]?.meets_target ? 90 : 90)}
                      stroke="#52525b"
                      strokeDasharray="2 3"
                    />
                    <Line type="monotone" dataKey="a" stroke={SERIES_INK[0]} strokeWidth={2} strokeDasharray="4 3" dot />
                    <Line type="monotone" dataKey="b" stroke={SERIES_INK[1]} strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-rule-strong p-4 sm:p-5">
              <h3 className="font-label text-[13px] text-zinc-300">Recommendation</h3>
              <p className="mt-2 font-label text-[12px] leading-relaxed text-zinc-400">
                {comparison.data.recommendation}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricTile({ metric }: { metric: ComparedMetric }) {
  const [before, after] = metric.values;
  const format = (value: number | null) => {
    if (value === null) return '—';
    if (metric.unit === 'fraction') return formatPercent(value);
    if (metric.unit === 'seconds') return formatDuration(value);
    if (metric.unit === 'hops') return value.toFixed(2);
    return String(value);
  };

  const delta =
    before === null || after === null
      ? null
      : metric.unit === 'fraction'
        ? formatPoints(after - before)
        : `${after - before >= 0 ? '+' : '−'}${Math.abs(after - before).toFixed(metric.unit === 'hops' ? 2 : 0)}`;

  const improved =
    before === null || after === null
      ? null
      : metric.higher_is_better
        ? after > before
        : after < before;

  return (
    <div className="flex flex-col border border-rule-strong">
      <div className="flex-1 px-3 pb-4 pt-3">
        <div className="font-label text-[12px] text-zinc-400">{metric.label}</div>
        <div className="mt-2 font-data text-[26px] leading-none tabular-nums text-zinc-100">
          {format(after)}
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 border-t border-rule px-3 py-2">
        <span className="font-data text-[11px] tabular-nums text-zinc-500">
          <span className="text-zinc-600">was</span> {format(before)}
        </span>
        <span
          className={cn(
            'font-data text-[11px] tabular-nums',
            improved === null ? 'text-zinc-500' : improved ? 'text-zinc-200' : 'text-alarm',
          )}
        >
          {delta ?? '—'}
        </span>
      </div>
    </div>
  );
}
