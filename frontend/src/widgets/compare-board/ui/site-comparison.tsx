'use client';

import { Fragment } from 'react';
import { cn, formatPercent, formatPoints } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { availabilityDomain, domainPosition, domainTicks, type SiteRow } from '../model/scale';

interface SiteComparisonProps {
  rows: SiteRow[];
  target: number;
  names: [string, string];
}

/**
 * One row per ground site, each a dumbbell from where the site was to where it
 * ends up. Three clients are three categories, not a series — joining them with
 * a line implied a trend between C65 and C70 that does not exist. Site labels,
 * tracks, figures and the axis share one grid so every row measures the same.
 */
export function SiteComparison({ rows, target, names }: SiteComparisonProps) {
  const { t } = useI18n();
  const domain = availabilityDomain(rows);
  const ticks = domainTicks(domain);
  const at = (value: number) => domainPosition(domain, value);
  const targetOnScale = target >= domain[0];

  return (
    <div className="border border-rule-strong p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <h3 className="font-label text-[13px] text-zinc-300">{t('compare.availability')}</h3>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-label text-[11px] text-zinc-500">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="h-[7px] w-[7px] flex-shrink-0 border border-[#6b6b72] bg-black" />
            <span className="truncate">{names[0]}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="h-[7px] w-[7px] flex-shrink-0 bg-zinc-100" />
            <span className="truncate text-zinc-400">{names[1]}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[9px] w-0 flex-shrink-0 border-l border-dashed border-zinc-500" />
            {t('compare.target', { value: formatPercent(target, 0) })}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:gap-x-3">
        {rows.map((row) => {
          const [a, b] = row.values;
          const below = b < target;

          return (
            <Fragment key={row.id}>
              <span
                className={cn('font-data text-[11px] tabular-nums', below ? 'text-alarm' : 'text-zinc-400')}
              >
                {row.id}
              </span>

              <div className="relative h-6">
                {ticks.map((tick) => (
                  <div
                    key={tick}
                    className="absolute inset-y-0 w-px bg-rule"
                    style={{ left: `${at(tick)}%` }}
                    aria-hidden="true"
                  />
                ))}
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" />
                {targetOnScale && (
                  <div
                    className="absolute inset-y-0 w-0 border-l border-dashed border-zinc-600"
                    style={{ left: `${at(target)}%` }}
                    aria-hidden="true"
                  />
                )}
                {/* The distance travelled, drawn before the markers so the two
                    ends sit on top of it. */}
                <div
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-zinc-600"
                  style={{ left: `${Math.min(at(a), at(b))}%`, width: `${Math.abs(at(b) - at(a))}%` }}
                />
                <div
                  className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 border border-[#6b6b72] bg-black"
                  style={{ left: `${at(a)}%` }}
                  title={`${names[0]} · ${formatPercent(a)}`}
                />
                <div
                  className={cn(
                    'absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2',
                    below ? 'bg-alarm' : 'bg-zinc-100',
                  )}
                  style={{ left: `${at(b)}%` }}
                  title={`${names[1]} · ${formatPercent(b)}`}
                />
              </div>

              <div className="flex items-baseline justify-end gap-1.5 font-data text-[11px] tabular-nums">
                <span className="hidden text-zinc-600 sm:inline">{formatPercent(a)}</span>
                <span className="hidden text-zinc-700 sm:inline">→</span>
                <span className={cn('w-[3.1rem] text-right', below ? 'text-alarm' : 'text-zinc-100')}>
                  {formatPercent(b)}
                </span>
                <span
                  className={cn(
                    'w-[4.4rem] text-right',
                    row.delta > 0 ? 'text-zinc-300' : row.delta < 0 ? 'text-alarm' : 'text-zinc-600',
                  )}
                >
                  {formatPoints(row.delta)}
                </span>
              </div>
            </Fragment>
          );
        })}

        <span />
        <div className="relative h-3">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2 font-data text-[9.5px] tabular-nums text-zinc-600"
              style={{ left: `${at(tick)}%` }}
            >
              {formatPercent(tick, 0)}
            </span>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}
