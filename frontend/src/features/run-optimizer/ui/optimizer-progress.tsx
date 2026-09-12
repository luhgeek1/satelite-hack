'use client';

import { AnimatePresence, motion } from 'motion/react';
import { formatWait } from '@/shared/lib';
import { IndeterminateBar } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { JobStatus } from '@/shared/api';

/**
 * The search reports from a fixed corner rather than from whichever panel
 * started it, so it stays legible whichever tab is open. Numbers come straight
 * from the job, so the bar, the percentage and the count never disagree; while
 * the job is still queued there is nothing to count yet and the bar says so by
 * sweeping instead of filling.
 */
export function OptimizerProgress({
  status,
  remainingS,
}: {
  status: JobStatus | undefined;
  remainingS: number | null;
}) {
  const { t } = useI18n();
  const queued = !status || status.status === 'queued' || !status.total;
  const percent = Math.round((status?.progress ?? 0) * 100);

  return (
    <div className="flex w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col border border-rule-strong bg-black/90 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule px-3 py-2">
        <span className="font-label text-[12px] text-zinc-300">{t('optimizer.title')}</span>
        <span className="flex items-baseline gap-2">
          {remainingS !== null && (
            <span className="font-data text-[10px] tabular-nums text-zinc-500">
              {t('optimizer.remaining', { wait: formatWait(remainingS) })}
            </span>
          )}
          <span className="font-data text-[11px] tabular-nums text-zinc-100">
            {queued ? '—' : `${percent}%`}
          </span>
        </span>
      </div>

      <div className="px-3 pb-3 pt-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={queued ? 'queued' : 'running'}
              className="min-w-0 truncate font-label text-[12px] text-zinc-400"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              {queued ? t('optimizer.queued') : t('optimizer.searching')}
            </motion.span>
          </AnimatePresence>
          <span className="flex-shrink-0 font-data text-[10px] tabular-nums text-zinc-500">
            {status?.total ? `${status.explored}/${status.total}` : '—'}
          </span>
        </div>

        <div className="mt-2">
          {queued ? (
            <IndeterminateBar />
          ) : (
            <div className="relative h-0.5 w-full bg-rule-strong">
              <div
                className="h-full bg-zinc-200 transition-[width] duration-200 ease-linear"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>

        <div className="mt-2.5 flex h-5 items-center gap-1.5 overflow-hidden border border-rule px-2">
          <span className="flex-shrink-0 font-data text-[10px] text-zinc-600">&gt;</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status?.explored ?? -1}
              className="truncate font-data text-[10px] text-zinc-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {status?.total
                ? t('optimizer.evaluated', { done: status.explored, total: status.total })
                : t('optimizer.submitting')}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
