import { useEffect, useRef, useState } from 'react';
import type { SatelliteView } from '@/entities/satellite';


export const FAILURE_PING_MS = 3000;

export const FAILURE_RING_COUNT = 3;

export const FAILURE_RING_FLIGHT_MS = 900;





export const FAILURE_RING_INTERVAL_MS =
  (FAILURE_PING_MS - FAILURE_RING_FLIGHT_MS) / (FAILURE_RING_COUNT - 1);









export const useFailurePings = (satellites: SatelliteView[]): Set<string> => {
  const [pinging, setPinging] = useState<Set<string>>(() => new Set());
  const knownFailedRef = useRef<Set<string> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  useEffect(() => {
    const failed = new Set(satellites.filter(sat => sat.failed).map(sat => sat.id));
    const known = knownFailedRef.current;
    knownFailedRef.current = failed;




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



    timersRef.current.push(timer);
  }, [satellites]);

  return pinging;
};
