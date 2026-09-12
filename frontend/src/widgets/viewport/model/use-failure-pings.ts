import { useEffect, useRef, useState } from 'react';
import type { SatelliteView } from '@/entities/satellite';

/** How long a node keeps announcing that it has just gone down. */
export const FAILURE_PING_MS = 3000;
/** Waves per burst. */
export const FAILURE_RING_COUNT = 3;
/** One wave's flight time, out to the node's own footprint radius. */
export const FAILURE_RING_FLIGHT_MS = 900;
/**
 * Interval between waves. Derived so the last one lands exactly as the burst
 * ends — a wave that starts late enough to be cut off mid-flight reads as a
 * glitch rather than a sweep.
 */
export const FAILURE_RING_INTERVAL_MS =
  (FAILURE_PING_MS - FAILURE_RING_FLIGHT_MS) / (FAILURE_RING_COUNT - 1);

/**
 * The ids that are mid-burst right now.
 *
 * A failure is an event, but the data only carries state, so the transition is
 * what has to be watched: a node that appears in the failed set for the first
 * time gets one burst, and nothing that was already down announces itself
 * again. Both views read from this, so the globe and the map stay in step.
 */
export const useFailurePings = (satellites: SatelliteView[]): Set<string> => {
  const [pinging, setPinging] = useState<Set<string>>(() => new Set());
  const knownFailedRef = useRef<Set<string> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  useEffect(() => {
    const failed = new Set(satellites.filter(sat => sat.failed).map(sat => sat.id));
    const known = knownFailedRef.current;
    knownFailedRef.current = failed;

    // The first pass only records the ground truth. Whatever was already down
    // when the view opened is history, not news — otherwise every switch
    // between the globe and the map would replay old failures.
    if (!known) return;

    const fresh = [...failed].filter(id => !known.has(id));
    if (!fresh.length) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    setPinging(current => {
      const next = new Set(current);
      fresh.forEach(id => next.add(id));
      return next;
    });

    const timer = setTimeout(() => {
      setPinging(current => {
        const next = new Set(current);
        fresh.forEach(id => next.delete(id));
        return next;
      });
    }, FAILURE_PING_MS);

    // Held outside the effect's own cleanup: this effect re-runs on every
    // simulation tick, and tying the timer to it would cancel the burst.
    timersRef.current.push(timer);
  }, [satellites]);

  return pinging;
};
