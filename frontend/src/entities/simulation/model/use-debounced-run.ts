'use client';

import { useEffect, useRef, useState } from 'react';
import type { RunInput } from './run-input';
import { normalizeConfig } from './run-input';

const SETTLE_MS = 220;

/**
 * Holds the run input still while a control is being moved.
 *
 * A run costs ~150 ms, so the tool can recompute on its own rather than behind
 * a button — but the configuration is edited with sliders, and keying the query
 * straight off them would fire a request per animation frame. The panel stays
 * live at pointer speed; the query follows once the value stops changing.
 *
 * Switching scenarios skips the wait: that is a deliberate jump, not a drag.
 */
export function useDebouncedRunInput(input: RunInput, settleMs = SETTLE_MS): RunInput {
  const [settled, setSettled] = useState(input);
  const scenarioRef = useRef(input.scenarioId);

  const signature = JSON.stringify({
    scenarioId: input.scenarioId,
    config: normalizeConfig(input.config),
    strategy: input.strategy,
  });

  useEffect(() => {
    if (scenarioRef.current !== input.scenarioId) {
      scenarioRef.current = input.scenarioId;
      setSettled(input);
      return;
    }

    const timer = window.setTimeout(() => setSettled(input), settleMs);
    return () => window.clearTimeout(timer);
    // The signature is the value that matters; `input` is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, settleMs]);

  return settled;
}

export const isSettling = (live: RunInput, settled: RunInput): boolean =>
  JSON.stringify(normalizeConfig(live.config)) !== JSON.stringify(normalizeConfig(settled.config));
