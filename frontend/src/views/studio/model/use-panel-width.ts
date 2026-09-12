'use client';

import { useCallback, useEffect, useState } from 'react';
import { isFiniteNumber, readStored, writeStored } from '@/shared/lib';

const STORAGE_KEY = 'orbitguard-panel-width-v1';
/** Real pixels on screen, not the units the zoomed subtree lays itself out in. */
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;

/**
 * How much bigger the data column draws than it measures, by screen.
 *
 * The panel is dense by design — forty-eight nodes, four parameter groups and
 * a day of outage windows have to fit — and on a laptop that density is the
 * only way it fits at all, so there it draws as designed. A larger screen has
 * room to spend on legibility, and zoom spends it on everything at once: type,
 * rules and spacing keep their proportions instead of drifting into a second
 * set of sizes to maintain.
 */
export const panelScaleFor = (viewportWidth: number) => {
  if (viewportWidth >= 1920) return 1.25;
  if (viewportWidth >= 1440) return 1.125;
  return 1;
};

/** A third of the screen at most: past that the map stops being the subject. */
const boundsFor = (viewportWidth: number) => {
  const max = Math.max(MIN_WIDTH, Math.round(viewportWidth / 3));
  return { min: Math.min(MIN_WIDTH, max), max };
};

const clampTo = (width: number, viewportWidth: number) => {
  const { min, max } = boundsFor(viewportWidth);
  return Math.max(min, Math.min(max, Math.round(width)));
};

/** The data column's width, dragged from its left edge and kept across visits. */
export function usePanelWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [scale, setScale] = useState(1);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const saved = readStored(STORAGE_KEY, isFiniteNumber);
    setWidth(clampTo(saved ?? DEFAULT_WIDTH, window.innerWidth));
    setScale(panelScaleFor(window.innerWidth));
  }, []);

  // A window that shrinks takes the panel down with it: a third of the screen
  // is a third of whatever the screen has become.
  useEffect(() => {
    const onResize = () => {
      setWidth((current) => clampTo(current, window.innerWidth));
      setScale(panelScaleFor(window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const onMove = (event: PointerEvent) => {
      // The column is pinned to the right edge, so the pointer's distance from
      // that edge is the width it is asking for.
      setWidth(clampTo(window.innerWidth - event.clientX, window.innerWidth));
    };
    const onUp = () => setResizing(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizing]);

  useEffect(() => {
    if (resizing) return;
    writeStored(STORAGE_KEY, width);
  }, [resizing, width]);

  // A drag over the globe must not leave the page half-selected behind it.
  useEffect(() => {
    if (!resizing) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = previous;
      document.body.style.userSelect = '';
    };
  }, [resizing]);

  return {
    width,
    scale,
    resizing,
    /** Layout units inside the zoomed subtree, which draws them `scale` bigger. */
    layoutWidth: width / scale,
    startResize: useCallback(() => setResizing(true), []),
    reset: useCallback(() => setWidth(clampTo(DEFAULT_WIDTH, window.innerWidth)), []),
  };
}
