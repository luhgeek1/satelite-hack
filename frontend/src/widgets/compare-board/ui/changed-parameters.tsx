'use client';

import { useI18n } from '@/shared/i18n';
import type { ParameterDiff } from '@/shared/api';


export function ChangedParameters({ diffs }: { diffs: ParameterDiff[] }) {
  const { t } = useI18n();

  return (
    <div className="border border-rule-strong">
      <div className="border-b border-rule px-3 py-2 font-label text-[13px] text-zinc-300">
        {t('compare.changed')}
      </div>

      {diffs.length === 0 ? (
        <div className="px-3 py-2.5 font-label text-[11px] text-zinc-500">{t('compare.noChanges')}</div>
      ) : (
        diffs.map((diff) => (
          <div
            key={diff.path}
            className="flex items-baseline gap-2 border-b border-rule px-3 py-1.5 last:border-b-0"
          >
            <span className="min-w-0 truncate font-label text-[12px] text-zinc-400">{diff.label}</span>
            <span className="ml-auto font-data text-[11px] tabular-nums text-zinc-600">
              {String(diff.values[0] ?? '—')}
            </span>
            <span className="font-data text-[11px] text-zinc-700">→</span>
            <span className="font-data text-[12px] tabular-nums text-zinc-100">
              {String(diff.values[1] ?? '—')}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
