'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { SatelliteView } from '@/entities/satellite';

interface SatelliteComboboxProps {
  id: string;
  candidates: SatelliteView[];
  value: string;
  onChange: (satelliteId: string) => void;
}










export function SatelliteCombobox({ id, candidates, value, onChange }: SatelliteComboboxProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [anchor, setAnchor] = useState<
    { left: number; top: number; width: number; height: number; scale: number } | null
  >(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((satellite) =>
      `${satellite.id} ${satellite.planeId}`.toLowerCase().includes(needle),
    );
  }, [candidates, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);





  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const element = field.current;
      const box = element?.getBoundingClientRect();
      if (!element || !box) return;
      const below = window.innerHeight - box.bottom;
      setAnchor({
        left: box.left,
        top: box.bottom,
        width: box.width,

        height: below < 140 ? -box.top : below,




        scale: element.offsetWidth > 0 ? box.width / element.offsetWidth : 1,
      });
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);


  useEffect(() => {
    if (!open) return;
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);


  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrapper.current?.contains(target) || list.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const commit = (satellite: SatelliteView) => {
    onChange(satellite.id);
    setQuery(satellite.id);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => {
        if (!matches.length) return 0;
        return (current + step + matches.length) % matches.length;
      });
      return;
    }

    if (event.key === 'Enter' && open && matches[active]) {
      event.preventDefault();
      commit(matches[active]);
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapper} className="relative">
      <div
        ref={field}
        className={cn(
          'flex items-center border bg-black transition-colors',
          open ? 'border-zinc-500' : 'border-rule-strong',
        )}
      >
        <input
          id={id}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${id}-${matches[active].id}` : undefined}
          value={query}
          placeholder={t('failure.search')}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);


            if (value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-1.5 pl-2 font-data text-[11px] uppercase text-zinc-200 placeholder:normal-case placeholder:text-zinc-600 focus:outline-none"
        />

        {query && (
          <button
            type="button"
            aria-label={t('failure.clear')}
            onClick={() => {
              setQuery('');
              onChange('');
              setOpen(true);
            }}
            className="px-1 text-zinc-600 transition-colors hover:text-zinc-200 focus-visible:text-zinc-200 focus-visible:outline-none"
          >
            <X size={12} />
          </button>
        )}

        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen((current) => !current)}
          className="px-1.5 text-zinc-600 transition-colors hover:text-zinc-300"
        >
          <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && anchor && createPortal(
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"


          style={
            anchor.height > 0
              ? {
                  zoom: anchor.scale,
                  left: anchor.left / anchor.scale,
                  top: (anchor.top + 1) / anchor.scale,
                  width: anchor.width / anchor.scale,
                  maxHeight: Math.min(224, anchor.height - 12) / anchor.scale,
                }
              : {
                  zoom: anchor.scale,
                  left: anchor.left / anchor.scale,
                  bottom:
                    (window.innerHeight - anchor.top + anchor.height + 1) / anchor.scale,
                  width: anchor.width / anchor.scale,
                  maxHeight: Math.min(224, -anchor.height - 12) / anchor.scale,
                }
          }
          className="fixed z-50 overflow-y-auto overscroll-contain border border-rule-strong bg-black shadow-xl"
        >
          {matches.map((satellite, index) => (
            <li key={satellite.id}>
              <button
                type="button"
                id={`${id}-${satellite.id}`}
                role="option"
                aria-selected={satellite.id === value}

                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(satellite)}
                className={cn(
                  'flex w-full items-baseline gap-2 px-2 py-1 text-left font-data text-[11px] transition-colors',
                  index === active ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-400',
                )}
              >
                <span>{satellite.id}</span>
                <span className="ml-auto text-[10px] text-zinc-500">{satellite.planeId}</span>
              </button>
            </li>
          ))}

          {matches.length === 0 && (
            <li className="px-2 py-2 font-label text-[11px] leading-relaxed text-zinc-500">
              {t('failure.noMatch', { query: query.trim() })}
            </li>
          )}
        </ul>,
        document.body,
      )}
    </div>
  );
}
