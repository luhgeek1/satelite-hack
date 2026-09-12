'use client';

import { AlertTriangle } from 'lucide-react';
import { ApiError } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

export function ErrorNote({ error }: { error: unknown }) {
  const { t } = useI18n();
  const message = error instanceof ApiError ? error.message : t('error.generic');
  const field = error instanceof ApiError ? error.field : undefined;

  return (
    <div className="flex items-start gap-2 border border-alarm/40 bg-alarm/5 px-3 py-2">
      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-alarm" />
      <div className="min-w-0">
        <div className="font-label text-[12px] text-alarm">{message}</div>
        {field && <div className="mt-0.5 font-data text-[10px] text-zinc-500">field: {field}</div>}
      </div>
    </div>
  );
}
