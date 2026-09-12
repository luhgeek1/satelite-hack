'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Upload, X } from 'lucide-react';
import { cn } from '@/shared/lib';

export type ImportButtonState = 'idle' | 'pending' | 'loaded' | 'failed';

const ICON = 13;
/** The check's own green: the one success in an interface that is otherwise grey and red. */
const SUCCESS = '#34d399';

const swap = {
  initial: { opacity: 0, scale: 0.4 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.4 },
};

function Spinner() {
  return (
    <motion.svg
      width={ICON}
      height={ICON}
      viewBox="0 0 16 16"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M8 2 a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  );
}

function DrawnCheck({ reduce }: { reduce: boolean }) {
  return (
    <svg width={ICON + 3} height={ICON + 3} viewBox="0 0 16 16" className="-m-[1.5px]">
      <motion.circle
        cx="8"
        cy="8"
        r="7"
        fill={SUCCESS}
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 22 }}
        style={{ originX: '50%', originY: '50%' }}
      />
      <motion.path
        d="M4.6 8.3 L7 10.6 L11.4 5.8"
        fill="none"
        stroke="#04130c"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.14, duration: 0.32, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}

interface ImportButtonProps {
  state: ImportButtonState;
  label: string;
  title: string;
  onClick: () => void;
}

/**
 * The JSON upload button, which answers for itself.
 *
 * The report under it says what happened in words; the button says it at a
 * glance, where the eye already is: it turns while the file travels, draws a
 * green check when the scenario is in, and shakes red when it is not — then
 * settles back to the upload icon on its own.
 */
export function ImportButton({ state, label, title, onClick }: ImportButtonProps) {
  const reduce = Boolean(useReducedMotion());
  const loaded = state === 'loaded';
  const failed = state === 'failed';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={state === 'pending'}
      title={title}
      aria-busy={state === 'pending'}
      animate={
        failed && !reduce
          ? { x: [0, -5, 5, -4, 4, -2, 0] }
          : loaded && !reduce
            ? { scale: [1, 1.06, 1] }
            : { x: 0, scale: 1 }
      }
      transition={failed ? { duration: 0.42 } : { duration: 0.36, ease: 'easeOut' }}
      className={cn(
        'relative flex h-9 items-center gap-1.5 border px-2.5 font-label text-[12px] transition-colors duration-300 focus-visible:border-zinc-400 focus-visible:outline-none disabled:cursor-wait',
        loaded
          ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
          : failed
            ? 'border-alarm/60 bg-alarm/10 text-alarm'
            : 'border-rule-strong text-zinc-400 hover:border-zinc-600 hover:text-zinc-100',
      )}
    >
      {/* A ring that leaves the button once, so success is seen from the corner of the eye. */}
      <AnimatePresence>
        {loaded && !reduce && (
          <motion.span
            key="ring"
            aria-hidden
            className="pointer-events-none absolute inset-0 border border-emerald-400"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 1.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <span className="relative flex h-[13px] w-[13px] items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={state}
            className="absolute inset-0 flex items-center justify-center"
            {...(reduce ? {} : swap)}
            transition={{ duration: 0.18 }}
          >
            {state === 'pending' ? (
              <Spinner />
            ) : loaded ? (
              <DrawnCheck reduce={reduce} />
            ) : failed ? (
              <X size={ICON} strokeWidth={2.5} />
            ) : (
              <Upload size={ICON} />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="hidden sm:inline">{label}</span>
    </motion.button>
  );
}
