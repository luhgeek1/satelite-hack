'use client';

import { useEffect } from 'react';
import { useSession } from '@/entities/session';

const TICK_MS = 120;

export function usePlayback(stepS: number, horizonS: number) {
  const { state, dispatch } = useSession();

  useEffect(() => {
    if (!state.playing || !horizonS || !stepS) return;

    const timer = window.setInterval(() => {
      dispatch({ type: 'advance', stepS: stepS * state.speed, horizonS });
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [state.playing, state.speed, stepS, horizonS, dispatch]);

  return {
    playing: state.playing,
    speed: state.speed,
    tS: state.tS,
    toggle: () => dispatch({ type: 'setPlaying', playing: !state.playing }),
    setSpeed: (speed: number) => dispatch({ type: 'setSpeed', speed }),
    seek: (tS: number) => dispatch({ type: 'seek', tS }),
  };
}

export const snapToGrid = (tS: number, stepS: number) => Math.floor(tS / stepS) * stepS;
