'use client';

import { useEffect, useRef, useState } from 'react';
import type { RunInput } from './run-input';
import { normalizeConfig } from './run-input';

const SETTLE_MS = 160;
/**
 * A drag that never pauses still gets a fresh run this often. Without a floor
 * the strip and the metrics sit on the last committed value for as long as the
 * pointer keeps moving, which reads as a frozen panel; with it they follow the
 * slider a few times a second while the request count stays bounded.
 */
const MAX_STALL_MS = 550;

/**
 * Holds the run input still while a control is being moved.
 *
 * A run costs ~150 ms, so the tool can recompute on its own rather than behind
 * a button — but the configuration is edited with sliders, and keying the query
 * straight off them would fire a request per animation frame. The panel stays
 * live at pointer speed; the query follows once the value stops changing, and
 * at `MAX_STALL_MS` intervals in the meantime.
 *
 * Two things skip the wait entirely: switching scenarios, which is a deliberate
 * jump rather than a drag, and a commit — the pointer coming off a slider, when
 * there is nothing left to wait for.
 */
export function useDebouncedRunInput(
  input: RunInput,
  commitNonce = 0,
  settleMs = SETTLE_MS,
): RunInput {
  const [settled, setSettled] = useState(input);
  const scenarioRef = useRef(input.scenarioId);
  const commitRef = useRef(commitNonce);
  const settledAt = useRef(0);

  const signature = JSON.stringify({
    scenarioId: input.scenarioId,
    config: normalizeConfig(input.config),
    strategy: input.strategy,
  });

  useEffect(() => {
    const now = Date.now();

    const commit = () => {
      settledAt.current = Date.now();
      setSettled(input);
    };

    if (scenarioRef.current !== input.scenarioId) {
      scenarioRef.current = input.scenarioId;
      commit();
      return;
    }

    if (commitRef.current !== commitNonce) {
      commitRef.current = commitNonce;
      commit();
      return;
    }

    const since = now - settledAt.current;
    const wait = since >= MAX_STALL_MS ? 0 : Math.min(settleMs, MAX_STALL_MS - since);

    const timer = window.setTimeout(commit, wait);
    return () => window.clearTimeout(timer);
    // The signature is the value that matters; `input` is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, commitNonce, settleMs]);

  return settled;
}

export const isSettling = (live: RunInput, settled: RunInput): boolean =>
  JSON.stringify(normalizeConfig(live.config)) !== JSON.stringify(normalizeConfig(settled.config));
