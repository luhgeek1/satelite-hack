import { useEffect, useRef, useCallback } from 'react';

const KONAMI_SEQUENCE: ((e: KeyboardEvent) => boolean)[] = [
  (e) => e.code === 'ArrowUp' || e.key === 'ArrowUp' || e.key === 'Up',
  (e) => e.code === 'ArrowUp' || e.key === 'ArrowUp' || e.key === 'Up',
  (e) => e.code === 'ArrowDown' || e.key === 'ArrowDown' || e.key === 'Down',
  (e) => e.code === 'ArrowDown' || e.key === 'ArrowDown' || e.key === 'Down',
  (e) => e.code === 'ArrowLeft' || e.key === 'ArrowLeft' || e.key === 'Left',
  (e) => e.code === 'ArrowRight' || e.key === 'ArrowRight' || e.key === 'Right',
  (e) => e.code === 'ArrowLeft' || e.key === 'ArrowLeft' || e.key === 'Left',
  (e) => e.code === 'ArrowRight' || e.key === 'ArrowRight' || e.key === 'Right',
  (e) => e.code === 'KeyB' || e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'и',
  (e) => e.code === 'KeyA' || e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'ф',
];

const TIMEOUT_MS = 3000;

export function useKonamiCode(onTrigger: () => void) {
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const trigger = useCallback(() => {
    onTriggerRef.current?.();
  }, []);

  useEffect(() => {
    // Expose console helper for testing/debugging
    (window as any).__explodePlanet = trigger;
    return () => {
      delete (window as any).__explodePlanet;
    };
  }, [trigger]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        indexRef.current = 0;
      }, TIMEOUT_MS);

      const matcher = KONAMI_SEQUENCE[indexRef.current];
      if (matcher && matcher(e)) {
        indexRef.current += 1;
        if (indexRef.current === KONAMI_SEQUENCE.length) {
          indexRef.current = 0;
          if (timerRef.current) clearTimeout(timerRef.current);
          onTriggerRef.current?.();
        }
      } else {
        // If current key matches first key (ArrowUp), start at 1, else reset to 0
        if (KONAMI_SEQUENCE[0](e)) {
          indexRef.current = 1;
        } else {
          indexRef.current = 0;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { trigger };
}
