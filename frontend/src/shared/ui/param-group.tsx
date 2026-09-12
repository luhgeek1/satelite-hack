'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/shared/lib';

interface ParamGroupProps {
  code: string;
  title: string;
  value: React.ReactNode;
  alarm?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function ParamGroup({ code, title, value, alarm, open, onToggle, children }: ParamGroupProps) {
  return (
    <section className="border-b border-rule last:border-b-0">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="group flex w-full items-stretch text-left focus-visible:outline-none"
        >
          <span
            className={cn(
              'flex w-9 flex-shrink-0 items-center justify-center border-r border-rule py-2.5 font-data text-[10px] tracking-[0.08em] transition-colors',
              alarm ? 'text-alarm' : open ? 'text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-300',
            )}
          >
            {code}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition-colors group-hover:bg-white/[0.03] group-focus-visible:bg-white/[0.06]">
            <span className="truncate font-label text-[13px] text-zinc-300">{title}</span>
            <span
              className={cn(
                'ml-auto font-data text-[11px] tabular-nums',
                alarm ? 'text-alarm' : 'text-zinc-500',
              )}
            >
              {value}
            </span>
            <ChevronDown
              size={12}
              className={cn(
                'flex-shrink-0 text-zinc-600 transition-transform duration-200',
                !open && '-rotate-90',
              )}
            />
          </span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="min-h-0 overflow-hidden"
          >
            <div className="flex">
              <div className="w-9 flex-shrink-0 border-r border-rule" />
              <div className="min-w-0 flex-1 px-3 pb-4 pt-1">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
