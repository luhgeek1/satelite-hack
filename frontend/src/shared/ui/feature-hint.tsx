'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn, readStored, writeStored } from '@/shared/lib';

interface FeatureHintProps {
  /** Remembers, per browser, that this control has introduced itself. */
  storageKey: string;
  title: string;
  text: string;
  /** Which side of the control the bubble hangs from. */
  side?: 'top' | 'bottom';
  /** How long after the page settles the first sighting appears. */
  delayMs?: number;
  className?: string;
  children: ReactNode;
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * A control explaining itself, once and then on demand.
 *
 * Two controls in this studio do something nobody would guess at from their
 * label, and both are easy to walk past. They say what they are on the first
 * visit, remember that they have, and stay available under the pointer after
 * that — so the explanation is never in the way and never gone.
 *
 * Solid blue on purpose. Red means an outage here and grey means a reading;
 * this is neither, it is the interface talking about itself.
 */
export function FeatureHint({
  storageKey,
  title,
  text,
  side = 'top',
  delayMs = 900,
  className,
  children,
}: FeatureHintProps) {
  const reduce = useReducedMotion();
  const [onboarding, setOnboarding] = useState(false);
  const [hovering, setHovering] = useState(false);
  /** Clicked away: gone until the pointer leaves and comes back. */
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (readStored(storageKey, isBoolean)) return;
    const timer = window.setTimeout(() => setOnboarding(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [storageKey, delayMs]);

  const seen = () => {
    setOnboarding(false);
    writeStored(storageKey, true);
  };

  useEffect(() => {
    if (!onboarding) return;
    document.addEventListener('pointerdown', seen);
    return () => document.removeEventListener('pointerdown', seen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding, storageKey]);

  return (
    <span
      className={cn('relative', className)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false);
        setClosed(false);
      }}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
    >
      {children}

      <AnimatePresence>
        {(onboarding || hovering) && !closed && (
          <motion.span
            role="tooltip"
            // Clicking the bubble puts it away — it is an explanation, and an
            // explanation in the way of the thing it explains is a nuisance.
            onClick={() => {
              setClosed(true);
              seen();
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: side === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: side === 'top' ? 2 : -2 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: 'easeOut' }}
            className={cn(
              'absolute left-1/2 z-40 block w-[15.5rem] -translate-x-1/2 cursor-default rounded-[10px] bg-[#2563eb] px-3 py-2.5 shadow-2xl',
              side === 'top' ? 'bottom-full mb-2.5' : 'top-full mt-2.5',
            )}
          >
            <span className="block font-label text-[11px] font-semibold leading-none text-white">
              {title}
            </span>
            <span className="mt-1.5 block font-label text-[11px] leading-snug text-white/85">
              {text}
            </span>
            <span
              className={cn(
                'absolute left-1/2 h-[8px] w-[8px] -translate-x-1/2 rotate-45 bg-[#2563eb]',
                side === 'top' ? '-bottom-[3px] rounded-br-[2px]' : '-top-[3px] rounded-tl-[2px]',
              )}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
