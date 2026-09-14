'use client';

import { useState } from 'react';
import { useSession } from '@/entities/session';
import type { GroundSiteView } from '@/entities/ground-site';
import { formatClock } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';

interface GatewayOutageFormProps {
  gateways: GroundSiteView[];
  currentTS: number;
  horizonS: number;
  stepS: number;
  onDone: () => void;
}

type Span = 'horizon' | 'from-now' | 'custom';









export function GatewayOutageForm({ gateways, currentTS, horizonS, stepS, onDone }: GatewayOutageFormProps) {
  const { dispatch } = useSession();
  const { t } = useI18n();
  const [gatewayId, setGatewayId] = useState(gateways[0]?.id ?? '');
  const [span, setSpan] = useState<Span>('from-now');
  const [startHour, setStartHour] = useState(Math.floor(currentTS / 3600));
  const [endHour, setEndHour] = useState(Math.min(24, Math.floor(currentTS / 3600) + 2));

  const snap = (seconds: number) => Math.floor(seconds / stepS) * stepS;

  const submit = () => {
    if (!gatewayId) return;
    let startS = 0;
    let endS = horizonS;
    if (span === 'from-now') startS = snap(currentTS);
    if (span === 'custom') {
      startS = snap(Math.min(startHour, 23) * 3600);
      endS = Math.min(horizonS, Math.max(startS + stepS, snap(endHour * 3600)));
    }
    dispatch({ type: 'addGatewayOutage', outage: { gateway_id: gatewayId, start_s: startS, end_s: endS } });
    onDone();
  };

  const spans: Array<{ id: Span; label: string }> = [
    { id: 'horizon', label: t('failure.wholeDay') },
    { id: 'from-now', label: t('failure.fromNow', { time: formatClock(currentTS) }) },
    { id: 'custom', label: t('failure.window') },
  ];

  return (
    <div className="space-y-2 border border-rule-strong p-2">
      {gateways.length > 1 ? (
        <>
          <label htmlFor="gateway-outage-target" className="block font-label text-[11px] text-zinc-400">
            {t('gatewayOutage.which')}
          </label>
          <select
            id="gateway-outage-target"
            value={gatewayId}
            onChange={(event) => setGatewayId(event.target.value)}
            className="w-full border border-rule-strong bg-black px-1.5 py-1 font-data text-[11px] text-zinc-200 focus:border-zinc-500 focus:outline-none"
          >
            {gateways.map((gateway) => (
              <option key={gateway.id} value={gateway.id}>
                {gateway.id} · {gateway.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="font-data text-[11px] text-zinc-300">{gatewayId}</p>
      )}

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
          <label htmlFor="gateway-outage-start" className="sr-only">
            {t('failure.startHour')}
          </label>
          <input
            id="gateway-outage-start"
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(event) => setStartHour(Number(event.target.value))}
            className="w-14 border border-rule-strong bg-black px-1.5 py-1 text-center text-zinc-200 focus:border-zinc-500 focus:outline-none"
          />
          <span>{t('failure.to')}</span>
          <label htmlFor="gateway-outage-end" className="sr-only">
            {t('failure.endHour')}
          </label>
          <input
            id="gateway-outage-end"
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
          disabled={!gatewayId}
          className="flex-1 border border-zinc-600 py-1.5 font-label text-[11px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:outline-none disabled:opacity-40"
        >
          {t('failure.submit')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 border border-rule py-1.5 font-label text-[11px] text-zinc-500 transition-colors hover:border-rule-strong hover:text-zinc-300 focus-visible:outline-none"
        >
          {t('failure.cancel')}
        </button>
      </div>
    </div>
  );
}
