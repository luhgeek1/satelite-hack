'use client';

import { useCallback, useEffect } from 'react';
import { useSession } from '@/entities/session';








const HORIZON_AT_1X_MS = 180_000;

const MIN_TICK_MS = 60;








export function playbackTickMs(stepS: number, horizonS: number, speed: number) {
  if (!stepS || !horizonS || !speed) return MIN_TICK_MS;
  const steps = Math.max(1, horizonS / stepS);
  return Math.max(MIN_TICK_MS, HORIZON_AT_1X_MS / steps / speed);
}

export function usePlayback(stepS: number, horizonS: number) {
  const { state, dispatch } = useSession();

  useEffect(() => {
    if (!state.playing || !horizonS || !stepS) return;

    const steps = Math.max(1, horizonS / stepS);
    const base = HORIZON_AT_1X_MS / steps;



    const tick = Math.max(MIN_TICK_MS, base / state.speed);
    const stride = Math.max(1, Math.round(state.speed * (tick / base)));

    const timer = window.setInterval(() => {
      dispatch({ type: 'advance', stepS: stepS * stride, horizonS });
    }, tick);

    return () => window.clearInterval(timer);
  }, [state.playing, state.speed, stepS, horizonS, dispatch]);




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
