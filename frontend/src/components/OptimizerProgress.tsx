import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface OptimizerProgressProps {
  /** Satellites the run is working over, so the log quotes the real scenario. */
  satelliteCount: number;
  onComplete: () => void;
}

/**
 * Total wall time of a run. The stages below are weighted, not timed, so this
 * is the single knob for how long the search appears to take.
 */
const RUN_MS = 25000;
const TICK_MS = 50;

/** Weighted phases of the search; the weights carry the original's pacing. */
const STAGES = [
  { label: 'Initialising heuristics', weight: 2 },
  { label: 'Analysing inter-satellite links', weight: 5 },
  { label: 'Simulating faults', weight: 8 },
  { label: 'Computing RAAN', weight: 7 },
  { label: 'Finalising', weight: 3 }
];

const TOTAL_WEIGHT = STAGES.reduce((sum, stage) => sum + stage.weight, 0);

const buildLog = (satelliteCount: number) => [
  `Loaded ${satelliteCount} satellites`,
  'Initialising graph traversal',
  'Applying 120 s step interval',
  'Checking P1 plane intersection',
  'Checking P2 plane intersection',
  'Identified 12 critical nodes',
  'Simulating S17 failure',
  'Simulating S22 failure',
  'Evaluating route availability',
  'Cross-referencing gateways',
  'Optimising phase angles',
  'Phase shift +7.5 deg applied',
  'Re-evaluating global coverage',
  'Minimising maximum outage',
  'Outage reduced from 26 m to 14 m',
  'Verifying constraints',
  'Configuration meets the 90% target',
  'Packaging results'
];

/**
 * The search reads as a pipeline rather than a spinner: which phase is running,
 * how far along the whole run is, and the last line the solver emitted. Numbers
 * come from one clock, so the bar, the percentage and the phase never disagree.
 */
export const OptimizerProgress: React.FC<OptimizerProgressProps> = ({ satelliteCount, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [logLine, setLogLine] = useState<string>('Initialising');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const log = buildLog(satelliteCount);
    const start = performance.now();

    const timer = setInterval(() => {
      // Driven off the clock rather than a tick count, so a throttled tab
      // resumes at the right place instead of finishing late.
      const elapsed = performance.now() - start;
      const fraction = Math.min(1, elapsed / RUN_MS);
      setProgress(fraction * 100);

      let weighted = fraction * TOTAL_WEIGHT;
      let index = 0;
      for (let i = 0; i < STAGES.length; i++) {
        if (weighted < STAGES[i].weight) { index = i; break; }
        weighted -= STAGES[i].weight;
        index = i;
      }
      setStageIndex(index);

      const line = Math.min(log.length - 1, Math.floor(fraction * log.length));
      setLogLine(log[line]);

      if (fraction >= 1) {
        clearInterval(timer);
        onCompleteRef.current();
      }
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [satelliteCount]);

  return (
    <div className="flex w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col border border-rule-strong bg-black/90 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule px-3 py-2">
        <span className="font-label text-[12px] text-zinc-300">Optimizer</span>
        <span className="font-data text-[11px] tabular-nums text-zinc-100">{progress.toFixed(0)}%</span>
      </div>

      <div className="px-3 pb-3 pt-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={stageIndex}
              className="min-w-0 truncate font-label text-[12px] text-zinc-400"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              {STAGES[stageIndex].label}
            </motion.span>
          </AnimatePresence>
          <span className="flex-shrink-0 font-data text-[10px] tabular-nums text-zinc-500">
            {stageIndex + 1}/{STAGES.length}
          </span>
        </div>

        {/* Phase boundaries are marked on the track, so the bar says which step
            it is in as well as how far it has come. */}
        <div className="relative mt-2 h-0.5 w-full bg-rule-strong">
          <div
            className="h-full bg-zinc-200 transition-[width] duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
          {STAGES.slice(0, -1).map((_, index) => {
            const offset = STAGES.slice(0, index + 1).reduce((sum, stage) => sum + stage.weight, 0) / TOTAL_WEIGHT;
            return (
              <span
                key={index}
                className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-black"
                style={{ left: `${offset * 100}%` }}
              />
            );
          })}
        </div>

        <div className="mt-2.5 flex h-5 items-center gap-1.5 overflow-hidden border border-rule px-2">
          <span className="flex-shrink-0 font-data text-[10px] text-zinc-600">&gt;</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={logLine}
              className="truncate font-data text-[10px] text-zinc-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {logLine}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
