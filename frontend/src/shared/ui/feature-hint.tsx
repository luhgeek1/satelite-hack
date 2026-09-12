'use client';

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/shared/lib';

interface FeatureHintProps {
  title: string;
  text: string;
  /** Which side of the control the bubble hangs from. */
  side?: 'top' | 'bottom';
  className?: string;
  children: ReactNode;
}

/**
 * A control explaining itself under the pointer.
 *
 * These used to introduce themselves unprompted on a first visit, several at
 * once, which is how a studio greets somebody with a scatter of bubbles and no
 * order to them. The guided tour does the introducing now, in a sequence; what
 * is left here is the answer to "what is this", where the thing is.
 *
 * Solid blue on purpose. Red means an outage here and grey means a reading;
 * this is neither, it is the interface talking about itself.
 */
export function FeatureHint({
  title,
  text,
  side = 'top',
  className,
  children,
}: FeatureHintProps) {
  const reduce = useReducedMotion();
  const [hovering, setHovering] = useState(false);
  /** Clicked away: gone until the pointer leaves and comes back. */
  const [closed, setClosed] = useState(false);

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
        {hovering && !closed && (
          <motion.span
            role="tooltip"
            // Clicking the bubble puts it away — it is an explanation, and an
            // explanation in the way of the thing it explains is a nuisance.
            onClick={() => setClosed(true)}
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
