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

  anchor?: string;
}









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
