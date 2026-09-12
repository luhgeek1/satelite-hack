'use client';

import { useState } from 'react';
import { formatClock } from '@/shared/lib';
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
    { id: 'horizon', label: 'Whole day' },
    { id: 'from-now', label: `From ${formatClock(currentTS)}` },
    { id: 'custom', label: 'Window' },
  ];

  return (
    <div className="space-y-2 border border-rule-strong p-2">
      <label htmlFor="failure-target" className="block font-label text-[11px] text-zinc-400">
        Which satellite fails?
      </label>
      <select
        id="failure-target"
        autoFocus
        value={satelliteId}
        onChange={(event) => setSatelliteId(event.target.value)}
        className="param-select w-full border border-rule-strong bg-black py-1.5 pl-2 pr-6 font-data text-[11px] text-zinc-200 focus:border-zinc-500 focus:outline-none"
      >
        <option value="" disabled>
          Select a node
        </option>
        {candidates.map((satellite) => (
          <option key={satellite.id} value={satellite.id}>
            {satellite.id} {satellite.planeId}
          </option>
        ))}
      </select>

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
            Outage start hour
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
          <span>to</span>
          <label htmlFor="failure-end" className="sr-only">
            Outage end hour
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
          <span>h UTC</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!satelliteId}
          className="flex-1 border border-zinc-600 py-1.5 font-label text-[11px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:outline-none disabled:opacity-40"
        >
          Inject
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-rule py-1.5 font-label text-[11px] text-zinc-500 transition-colors hover:border-rule-strong hover:text-zinc-300 focus-visible:outline-none"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
