'use client';

import { useCallback, useEffect } from 'react';
import { useSession } from '@/entities/session';

/**
 * How long a whole horizon takes at 1x. The day is meant to be watched rather
 * than flicked through — at the old pace a gap opened and closed before it
 * could be read. The scenario's own step decides the tick from this, so a file
 * with a coarser grid plays over the same wall time rather than three times
 * faster.
 */
const HORIZON_AT_1X_MS = 180_000;
/** Below this the browser is redrawing faster than anyone can follow. */
const MIN_TICK_MS = 60;

export function usePlayback(stepS: number, horizonS: number) {
  const { state, dispatch } = useSession();

  useEffect(() => {
    if (!state.playing || !horizonS || !stepS) return;

    const steps = Math.max(1, horizonS / stepS);
    const base = HORIZON_AT_1X_MS / steps;
    // Faster speeds shorten the interval until it hits the floor, and only
    // then take bigger strides: the multiplier stays exact either way, and
    // the motion stays as smooth as the budget allows.
    const tick = Math.max(MIN_TICK_MS, base / state.speed);
    const stride = Math.max(1, Math.round(state.speed * (tick / base)));

    const timer = window.setInterval(() => {
      dispatch({ type: 'advance', stepS: stepS * stride, horizonS });
    }, tick);

    return () => window.clearInterval(timer);
  }, [state.playing, state.speed, stepS, horizonS, dispatch]);

  // The controls are handed to a memoised strip, so they have to keep their
  // identity across a render the strip does not care about — a plane being
  // dragged, for one.
  const toggle = useCallback(
    () => dispatch({ type: 'setPlaying', playing: !state.playing }),
    [dispatch, state.playing],
  );
  const setSpeed = useCallback((speed: number) => dispatch({ type: 'setSpeed', speed }), [dispatch]);
  const seek = useCallback((tS: number) => dispatch({ type: 'seek', tS }), [dispatch]);

  return {
    playing: state.playing,
    speed: state.speed,
    tS: state.tS,
    toggle,
    setSpeed,
    seek,
  };
}

export const snapToGrid = (tS: number, stepS: number) => Math.floor(tS / stepS) * stepS;
