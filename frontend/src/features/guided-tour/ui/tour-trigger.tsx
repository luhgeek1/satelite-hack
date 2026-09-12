'use client';

import { Lightbulb } from 'lucide-react';
import { cn } from '@/shared/lib';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { useTour } from '../model/tour-store';
import type { TourId } from '../model/steps';

interface TourTriggerProps {
  tour: TourId;
  label: TranslationKey;
  size?: number;
  className?: string;
  /** Lets a tour point at its own lamp, which is where it ends. */
  anchor?: string;
}

/**
 * The way back in.
 *
 * A tour that runs once and cannot be asked for again is a tour people click
 * past. A lamp beside the thing it explains costs nothing and answers the
 * question people actually have, which is not "what is this studio" but "what
 * am I meant to do here".
 */
export function TourTrigger({ tour, label, size = 13, className, anchor }: TourTriggerProps) {
  const { start } = useTour();
  const { t } = useI18n();

  return (
    <button
      type="button"
      data-tour={anchor}
      onClick={() => start(tour)}
      title={t(label)}
      aria-label={t(label)}
      className={cn(
        'flex flex-shrink-0 items-center justify-center text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:outline-none',
        className,
      )}
    >
      <Lightbulb size={size} />
    </button>
  );
}
