'use client';

import { useCallback, useEffect, useState } from 'react';
import { isFiniteNumber, readStored, writeStored } from '@/shared/lib';

const STORAGE_KEY = 'orbitguard-panel-width-v1';
/** Real pixels on screen, not the units the zoomed subtree lays itself out in. */
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;

/**
 * How much bigger the two frames around the map — the data column and the
 * timeline strip — draw than they measure.
 *
 * Both are dense by design, and on a laptop that density is the only reason
 * they fit at all, so there they draw as designed. A larger screen has room to
 * spend on legibility, and zoom spends it on everything at once: type, rules
 * and spacing keep their proportions instead of drifting into a second set of
 * sizes to maintain.
 *
 * Height counts as much as width. The strip is a band across the bottom and
 * the column runs the full height of the window, so scaling on width alone
 * makes a short screen pay for its width in the room it has least of.
 */
export const uiScaleFor = (viewportWidth: number, viewportHeight: number) => {
  const room = Math.min(viewportWidth / 1440, viewportHeight / 900);
  return Math.round(Math.max(1, Math.min(1.25, room)) * 100) / 100;
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
    setScale(uiScaleFor(window.innerWidth, window.innerHeight));
  }, []);

  // A window that shrinks takes the panel down with it: a third of the screen
  // is a third of whatever the screen has become.
  useEffect(() => {
    const onResize = () => {
      setWidth((current) => clampTo(current, window.innerWidth));
      setScale(uiScaleFor(window.innerWidth, window.innerHeight));
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
