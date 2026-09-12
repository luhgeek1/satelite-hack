'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { useSession } from '@/entities/session';
import { useI18n } from '@/shared/i18n';
import { TOURS } from '../model/steps';
import { useTour } from '../model/tour-store';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Breathing room around the lit element, and between it and the bubble. */
const PAD = 6;
const GAP = 12;
const EDGE = 12;
const BUBBLE_W = 304;

/** Frames a target may be absent before the step is given up on. */
const PATIENCE = 40;

const read = (target: string): Box | null => {
  const element = document.querySelector(`[data-tour="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
};

const settled = (a: Box | null, b: Box) =>
  a !== null
  && Math.abs(a.top - b.top) < 0.5
  && Math.abs(a.left - b.left) < 0.5
  && Math.abs(a.width - b.width) < 0.5
  && Math.abs(a.height - b.height) < 0.5;

/**
 * One thing lit, everything else out of reach.
 *
 * The studio is dense on purpose, and density is exactly what a first visit
 * cannot read: every panel is equally loud, so nothing says where to start.
 * The tour answers that by taking the loudness away — four panes of dimming
 * around one rectangle, a sentence about it, and a way forward. Clicks outside
 * the rectangle are swallowed rather than merely discouraged, so the sequence
 * cannot be half-followed into a state the next sentence no longer describes.
 */
export function TourOverlay() {
  const { tour, index, next, back, stop } = useTour();
  const { dispatch } = useSession();
  const { t } = useI18n();
  const reduce = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(150);
  const bubble = useRef<HTMLDivElement | null>(null);
  const skip = useRef(next);
  skip.current = next;

  useEffect(() => setMounted(true), []);

  const steps = tour ? TOURS[tour] : [];
  const step = steps[index];
  const target = step?.target;
  const stepTab = step?.tab;
  const wandered = useRef(false);

  // A step may name something on another tab, and the panel it lives in may
  // still be mounting when the step arrives.
  useEffect(() => {
    if (!stepTab) return;
    if (stepTab !== 'simulation') wandered.current = true;
    dispatch({ type: 'setTab', tab: stepTab });
  }, [stepTab, dispatch]);

  // However the tour ends — finished, skipped, Escape — it ends where the work
  // is done. Left on the resilience tab, a newcomer's first real screen would
  // be the one they were only shown in passing.
  useEffect(() => {
    if (tour !== null || !wandered.current) return;
    wandered.current = false;
    dispatch({ type: 'setTab', tab: 'simulation' });
  }, [tour, dispatch]);

  useEffect(() => {
    if (!target) return;
    document
      .querySelector(`[data-tour="${target}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [target]);

  // Followed rather than measured once: the panel animates open, the globe
  // resizes, and a highlight a beat behind its subject reads as a bug.
  useEffect(() => {
    // Dropped rather than kept: a step whose target never appears would
    // otherwise spend its patience lighting up the previous step's element.
    setBox(null);
    if (!target) return;

    let frame = 0;
    let absent = 0;

    const tick = () => {
      const next = read(target);
      if (next) {
        absent = 0;
        setBox((current) => (settled(current, next) ? current : next));
      } else if ((absent += 1) > PATIENCE) {
        // Nothing to point at — a collapsed panel, a narrow screen — so the
        // step is dropped rather than left pointing at a corner.
        skip.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  useLayoutEffect(() => {
    const height = bubble.current?.offsetHeight;
    if (height) setBubbleHeight(height);
  }, [index, tour, box?.top]);

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') stop();
      if (event.key === 'ArrowRight' || event.key === 'Enter') next();
      if (event.key === 'ArrowLeft') back();
    },
    [next, back, stop],
  );

  useEffect(() => {
    if (!tour) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, onKey]);

  if (!mounted || !tour || !step || !box) return null;

  const lit = {
    top: box.top - PAD,
    left: box.left - PAD,
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  };
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const below = lit.top + lit.height + GAP;
  const above = lit.top - GAP - bubbleHeight;
  const top =
    below + bubbleHeight <= vh - EDGE
      ? below
      : above >= EDGE
        ? above
        : Math.max(EDGE, vh - bubbleHeight - EDGE);
  const left = Math.min(
    Math.max(EDGE, lit.left + lit.width / 2 - BUBBLE_W / 2),
    Math.max(EDGE, vw - BUBBLE_W - EDGE),
  );

  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const panes = [
    { top: 0, left: 0, width: vw, height: Math.max(0, lit.top) },
    {
      top: lit.top + lit.height,
      left: 0,
      width: vw,
      height: Math.max(0, vh - lit.top - lit.height),
    },
    { top: lit.top, left: 0, width: Math.max(0, lit.left), height: lit.height },
    {
      top: lit.top,
      left: lit.left + lit.width,
      width: Math.max(0, vw - lit.left - lit.width),
      height: lit.height,
    },
  ];

  return createPortal(
    <motion.div
      key="tour"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
      className="fixed inset-0 z-[90]"
      role="dialog"
      aria-modal="true"
      aria-label={t('tour.label')}
    >
      {panes.map((pane, position) => (
        <div
          key={position}
          onClick={swallow}
          className="absolute bg-black/70"
          style={{ top: pane.top, left: pane.left, width: pane.width, height: pane.height }}
        />
      ))}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute border border-[#2563eb]"
        style={{ top: lit.top, left: lit.left, width: lit.width, height: lit.height }}
      />

      <div
        ref={bubble}
        className="absolute rounded-[10px] bg-[#2563eb] px-3.5 py-3 shadow-2xl"
        style={{ top, left, width: BUBBLE_W }}
      >
        <div className="flex items-baseline gap-2">
          <span className="font-label text-[12px] font-semibold leading-none text-white">
            {t(step.title)}
          </span>
          <span className="ml-auto font-data text-[10px] tabular-nums text-white/60">
            {index + 1}/{steps.length}
          </span>
        </div>

        <p className="mt-2 font-label text-[11px] leading-relaxed text-white/90">
          {t(step.text)}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={stop}
            className="font-label text-[11px] text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:outline-none"
          >
            {t('tour.skip')}
          </button>

          {index > 0 && (
            <button
              type="button"
              onClick={back}
              className="ml-auto border border-white/40 px-2 py-1 font-label text-[11px] text-white transition-colors hover:bg-white/15 focus-visible:outline-none"
            >
              {t('tour.back')}
            </button>
          )}

          <button
            type="button"
            onClick={next}
            className={cnNext(index === 0)}
          >
            {t(index + 1 === steps.length ? 'tour.done' : 'tour.next')}
          </button>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}

/** The forward button carries the row on the first step, where there is no Back. */
const cnNext = (first: boolean) =>
  `${first ? 'ml-auto ' : ''}bg-white px-2.5 py-1 font-label text-[11px] font-semibold text-[#1d4ed8] transition-colors hover:bg-white/90 focus-visible:outline-none`;
