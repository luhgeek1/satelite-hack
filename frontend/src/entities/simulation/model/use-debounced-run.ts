'use client';

import { useEffect, useRef, useState } from 'react';
import type { RunInput } from './run-input';
import { normalizeConfig } from './run-input';

const SETTLE_MS = 160;






const MAX_STALL_MS = 550;














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


  }, [signature, commitNonce, settleMs]);

  return settled;
}

export const isSettling = (live: RunInput, settled: RunInput): boolean =>
  JSON.stringify(normalizeConfig(live.config)) !== JSON.stringify(normalizeConfig(settled.config));
