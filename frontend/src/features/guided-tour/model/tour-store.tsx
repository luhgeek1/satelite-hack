'use client';

import * as React from 'react';
import { readStored, writeStored } from '@/shared/lib';
import { TOURS, type TourId } from './steps';



const SEEN_KEY = 'orbitguard-tour-v2';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

interface TourValue {
  tour: TourId | null;
  index: number;
  start: (tour: TourId) => void;

  autoStart: () => void;
  next: () => void;
  back: () => void;
  stop: () => void;
}

const TourContext = React.createContext<TourValue | null>(null);









export function TourProvider({ children }: { children: React.ReactNode }) {
  const [tour, setTour] = React.useState<TourId | null>(null);
  const [index, setIndex] = React.useState(0);

  const stop = React.useCallback(() => {
    setTour(null);
    setIndex(0);
    writeStored(SEEN_KEY, true);
  }, []);

  const start = React.useCallback((next: TourId) => {
    setTour(next);
    setIndex(0);
  }, []);

  const autoStart = React.useCallback(() => {
    if (readStored(SEEN_KEY, isBoolean)) return;



    writeStored(SEEN_KEY, true);
    start('studio');
  }, [start]);

  const value = React.useMemo<TourValue>(
    () => ({
      tour,
      index,
      start,
      autoStart,
      next: () =>
        setIndex((current) => {
          const steps = tour ? TOURS[tour] : [];
          if (current + 1 >= steps.length) {
            stop();
            return 0;
          }
          return current + 1;
        }),
      back: () => setIndex((current) => Math.max(0, current - 1)),
      stop,
    }),
    [tour, index, start, autoStart, stop],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const context = React.useContext(TourContext);
  if (!context) throw new Error('useTour must be used inside TourProvider');
  return context;
}
