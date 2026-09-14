'use client';

import { useCallback, useEffect, useState } from 'react';
import { isFiniteNumber, readStored, writeStored } from '@/shared/lib';

const STORAGE_KEY = 'orbitguard-panel-width-v1';

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;















export const uiScaleFor = (viewportWidth: number, viewportHeight: number) => {
  const room = Math.min(viewportWidth / 1440, viewportHeight / 900);
  return Math.round(Math.max(1, Math.min(1.25, room)) * 100) / 100;
};


const boundsFor = (viewportWidth: number) => {
  const max = Math.max(MIN_WIDTH, Math.round(viewportWidth / 3));
  return { min: Math.min(MIN_WIDTH, max), max };
};

const clampTo = (width: number, viewportWidth: number) => {
  const { min, max } = boundsFor(viewportWidth);
  return Math.max(min, Math.min(max, Math.round(width)));
};


export function usePanelWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [scale, setScale] = useState(1);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const saved = readStored(STORAGE_KEY, isFiniteNumber);
    setWidth(clampTo(saved ?? DEFAULT_WIDTH, window.innerWidth));
    setScale(uiScaleFor(window.innerWidth, window.innerHeight));
  }, []);



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

    layoutWidth: width / scale,
    startResize: useCallback(() => setResizing(true), []),
    reset: useCallback(() => setWidth(clampTo(DEFAULT_WIDTH, window.innerWidth)), []),
  };
}
