'use client';

import { useState } from 'react';
import { formatClock } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { SatelliteCombobox } from './satellite-combobox';
import type { SatelliteView } from '@/entities/satellite';
import type { FailureRequest } from '../model/use-failure-mutation';

interface FailureFormProps {
  candidates: SatelliteView[];
  currentTS: number;
  horizonS: number;
  stepS: number;
  onSubmit: (request: FailureRequest) => void;
  onCancel: () => void;
}

type Span = 'horizon' | 'from-now' | 'custom';

export function FailureForm({
  candidates,
  currentTS,
  horizonS,
  stepS,
  onSubmit,
  onCancel,
}: FailureFormProps) {
  const { t } = useI18n();
  const [satelliteId, setSatelliteId] = useState('');
  const [span, setSpan] = useState<Span>('horizon');
  const [startHour, setStartHour] = useState(Math.floor(currentTS / 3600));
  const [endHour, setEndHour] = useState(Math.min(24, Math.floor(currentTS / 3600) + 2));

  const snap = (seconds: number) => Math.floor(seconds / stepS) * stepS;

  const submit = () => {
    if (!satelliteId) return;

    if (span === 'horizon') {
      onSubmit({ satelliteId, startS: 0, endS: horizonS });
      return;
    }
    if (span === 'from-now') {
      onSubmit({ satelliteId, startS: snap(currentTS), endS: horizonS });
      return;
    }

    const startS = snap(Math.min(startHour, 23) * 3600);
    const endS = Math.min(horizonS, Math.max(startS + stepS, snap(endHour * 3600)));
    onSubmit({ satelliteId, startS, endS });
  };

  const spans: Array<{ id: Span; label: string }> = [
    { id: 'horizon', label: t('failure.wholeDay') },
    { id: 'from-now', label: t('failure.fromNow', { time: formatClock(currentTS) }) },
    { id: 'custom', label: t('failure.window') },
  ];

  return (
    <div className="space-y-2 border border-rule-strong p-2">
      <label htmlFor="failure-target" className="block font-label text-[11px] text-zinc-400">
        {t('failure.which')}
      </label>
      <SatelliteCombobox
        id="failure-target"
        candidates={candidates}
        value={satelliteId}
        onChange={setSatelliteId}
      />

      <div className="flex border border-rule-strong">
        {spans.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSpan(option.id)}
            aria-pressed={span === option.id}
            className={
              span === option.id
                ? 'flex-1 border-l border-rule-strong bg-zinc-100 py-1 font-data text-[10px] text-black first:border-l-0'
                : 'flex-1 border-l border-rule-strong py-1 font-data text-[10px] text-zinc-500 transition-colors first:border-l-0 hover:text-zinc-200'
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {span === 'custom' && (
        <div className="flex items-center gap-2 font-data text-[10px] text-zinc-500">
          <label htmlFor="failure-start" className="sr-only">
            {t('failure.startHour')}
          </label>
          <input
            id="failure-start"
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(event) => setStartHour(Number(event.target.value))}
            className="w-14 border border-rule-strong bg-black px-1.5 py-1 text-center text-zinc-200 focus:border-zinc-500 focus:outline-none"
          />
          <span>{t('failure.to')}</span>
          <label htmlFor="failure-end" className="sr-only">
            {t('failure.endHour')}
          </label>
          <input
            id="failure-end"
            type="number"
            min={1}
            max={24}
            value={endHour}
            onChange={(event) => setEndHour(Number(event.target.value))}
            className="w-14 border border-rule-strong bg-black px-1.5 py-1 text-center text-zinc-200 focus:border-zinc-500 focus:outline-none"
          />
          <span>{t('failure.hUtc')}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!satelliteId}
          className="flex-1 border border-zinc-600 py-1.5 font-label text-[11px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:outline-none disabled:opacity-40"
        >
          {t('failure.submit')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-rule py-1.5 font-label text-[11px] text-zinc-500 transition-colors hover:border-rule-strong hover:text-zinc-300 focus-visible:outline-none"
        >
          {t('failure.cancel')}
        </button>
      </div>
    </div>
  );
}
