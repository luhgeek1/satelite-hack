'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RadioTower, Search, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useSession } from '@/entities/session';
import { cn, formatClock } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import {
  overlaps,
  windowClock,
  type OutageKind,
  type OutageNode,
  type OutageTarget,
  type OutageWindow,
} from '../model/targets';

interface OutagePickerProps {
  window: OutageWindow;
  horizonS: number;
  satellites: OutageNode[];
  gateways: OutageNode[];

  onToggle: (target: OutageTarget, off: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}

const SECTIONS: Array<{ kind: OutageKind; label: 'window.gateways' | 'window.satellites' }> = [
  { kind: 'gateway', label: 'window.gateways' },
  { kind: 'satellite', label: 'window.satellites' },
];


const LIST_MAX = 152;









export function OutagePicker({
  window: span,
  horizonS,
  satellites,
  gateways,
  onToggle,
  onRemove,
  onClose,
}: OutagePickerProps) {
  const { t, formatDuration } = useI18n();
  const { state } = useSession();
  const [kind, setKind] = useState<OutageKind>('gateway');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);



  const [height, setHeight] = useState<number | null>(null);



  const offIds = useMemo(() => {
    const ids = new Set<string>();
    for (const failure of state.config.failures ?? []) {
      if (overlaps(span, failure.start_s, failure.end_s)) ids.add(failure.satellite_id);
    }
    for (const outage of state.config.gateway_outages ?? []) {
      if (overlaps(span, outage.start_s, outage.end_s)) ids.add(outage.gateway_id);
    }
    return ids;
  }, [state.config.failures, state.config.gateway_outages, span]);

  const nodes = kind === 'gateway' ? gateways : satellites;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return nodes;
    return nodes.filter((node) => `${node.id} ${node.detail}`.toLowerCase().includes(needle));
  }, [nodes, query]);

  useEffect(() => {
    setActive(0);
  }, [query, kind]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;

    const measure = () => setHeight(Math.min(LIST_MAX, element.scrollHeight));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [kind]);

  const toggle = (node: OutageNode) => onToggle({ kind, id: node.id }, !offIds.has(node.id));

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!matches.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Enter' && matches[active]) {
      event.preventDefault();
      toggle(matches[active]);
    }
  };

  return (
    <div className="border border-rule-strong bg-black shadow-2xl">
      <div className="flex items-start gap-2 px-2.5 pb-2 pt-2">
        <div className="min-w-0 flex-1">
          <div className="font-label text-[10px] leading-none text-zinc-500">{t('window.switchOff')}</div>
          <div className="mt-1.5 flex items-baseline gap-2 font-data text-[12px] leading-none tabular-nums text-zinc-100">
            {windowClock(span.startS, horizonS, formatClock)}
            <span className="text-zinc-600">&rarr;</span>
            {windowClock(span.endS, horizonS, formatClock)}
            <span className="ml-auto text-[10px] text-zinc-500">{formatDuration(span.endS - span.startS)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('window.remove')}
          title={t('window.remove')}
          className="-mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center text-zinc-600 transition-colors hover:text-alarm focus-visible:text-alarm focus-visible:outline-none"
        >
          <Trash2 size={12} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('window.close')}
          className="-mr-1 -mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center text-zinc-600 transition-colors hover:text-zinc-200 focus-visible:text-zinc-200 focus-visible:outline-none"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex border-y border-rule">
        {SECTIONS.map((section) => {
          const count = (section.kind === 'gateway' ? gateways : satellites).filter((node) =>
            offIds.has(node.id),
          ).length;

          return (
            <button
              key={section.kind}
              type="button"
              onClick={() => setKind(section.kind)}
              aria-pressed={kind === section.kind}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 border-l border-rule py-1.5 font-label text-[11px] transition-colors first:border-l-0 focus-visible:bg-white/15 focus-visible:outline-none',
                kind === section.kind
                  ? 'bg-white/[0.12] text-zinc-100'
                  : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200',
              )}
            >
              {t(section.label)}
              <span
                className={cn(
                  'font-data text-[9px] tabular-nums',
                  count ? 'text-alarm' : 'text-zinc-600',
                )}
              >
                {count || (section.kind === 'gateway' ? gateways.length : satellites.length)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 border-b border-rule px-2.5">
        <Search size={11} className="flex-shrink-0 text-zinc-600" />
        <input
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={t('window.search')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label={t('window.search')}
          className="min-w-0 flex-1 bg-transparent py-1.5 font-data text-[11px] uppercase text-zinc-200 placeholder:normal-case placeholder:text-zinc-600 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('failure.clear')}
            className="flex-shrink-0 text-zinc-600 transition-colors hover:text-zinc-200 focus-visible:text-zinc-200 focus-visible:outline-none"
          >
            <X size={11} />
          </button>
        )}
      </div>

      <div
        style={height === null ? undefined : { height }}
        className="overflow-y-auto overscroll-contain transition-[height] duration-200 ease-out"
      >
        <motion.ul
          key={kind}
          ref={list}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          onKeyDown={onKeyDown}
          className={kind === 'gateway' ? 'space-y-1.5 p-2' : 'py-1'}
        >
          {matches.map((node, index) => {
            const off = offIds.has(node.id);




            if (kind === 'gateway') {
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => toggle(node)}
                    aria-pressed={off}
                    className={cn(
                      'block w-full border p-2 text-left transition-colors',
                      off
                        ? 'border-alarm/50 bg-alarm/[0.07]'
                        : cn(
                            'bg-white/[0.02]',
                            index === active ? 'border-zinc-600' : 'border-rule-strong',
                          ),
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <RadioTower
                        size={13}
                        aria-hidden="true"
                        className={cn('flex-shrink-0', off ? 'text-alarm' : 'text-zinc-400')}
                      />
                      <span
                        className={cn(
                          'break-all font-data text-[12px]',
                          off ? 'text-alarm' : 'text-zinc-200',
                        )}
                      >
                        {node.id}
                      </span>
                      {off && (
                        <span className="ml-auto flex-shrink-0 font-label text-[10px] text-alarm">
                          {t('window.offNow')}
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 block break-words font-label text-[11px] leading-relaxed text-zinc-400">
                      {node.detail}
                    </span>
                  </button>
                </li>
              );
            }

            return (
              <li key={node.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => toggle(node)}
                  aria-pressed={off}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1 text-left font-data text-[11px] transition-colors',
                    index === active ? 'bg-white/[0.06]' : '',
                    off ? 'text-alarm' : 'text-zinc-300',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 flex-shrink-0 border',
                      off ? 'border-alarm bg-alarm' : 'border-zinc-700',
                    )}
                  />
                  <span className="flex-shrink-0">{node.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-600">{node.detail}</span>
                  {off && <span className="flex-shrink-0 text-[9px] text-alarm">{t('window.offNow')}</span>}
                </button>
              </li>
            );
          })}

          {matches.length === 0 && (
            <li className="px-2.5 py-2 font-label text-[11px] leading-snug text-zinc-500">
              {query.trim() ? t('failure.noMatch', { query: query.trim() }) : t('window.none')}
            </li>
          )}
        </motion.ul>
      </div>
    </div>
  );
}
