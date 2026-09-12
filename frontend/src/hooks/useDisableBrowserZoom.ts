import { useEffect } from 'react';

/** Keyboard zoom uses these with a modifier held. */
const ZOOM_KEYS = ['+', '-', '=', '_', '0'];

/**
 * Pins the page at 100%.
 *
 * The app is a fixed-viewport instrument panel: the shell never scrolls, and a
 * browser zoom leaves the WebGL globe, the SVG map and the panel measured in
 * different units, so the layout drifts out of step rather than getting bigger.
 * Pinch, ctrl/cmd + wheel and the keyboard shortcuts are all refused.
 *
 * This overrides a browser affordance deliberately — the trade is that the
 * layout stays responsive down to phone width instead of relying on zoom.
 */
export const useDisableBrowserZoom = () => {
  useEffect(() => {
    // Chrome and Firefox report a pinch as ctrl + wheel.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (ZOOM_KEYS.includes(event.key)) event.preventDefault();
    };

    // Safari's pinch never surfaces as a wheel event.
    const onGesture = (event: Event) => event.preventDefault();

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('gesturestart', onGesture);
    window.addEventListener('gesturechange', onGesture);
    window.addEventListener('gestureend', onGesture);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('gesturestart', onGesture);
      window.removeEventListener('gesturechange', onGesture);
      window.removeEventListener('gestureend', onGesture);
    };
  }, []);
};
