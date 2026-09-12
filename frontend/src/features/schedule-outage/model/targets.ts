export type OutageKind = 'satellite' | 'gateway';

/** A node the operator can switch off, as the picker lists it. */
export interface OutageNode {
  id: string;
  /** Plane for a satellite, site name for a gateway — what tells two rows apart. */
  detail: string;
}

export interface OutageTarget {
  kind: OutageKind;
  id: string;
}

/** Start inclusive, end exclusive, in seconds from the start of the day. */
export interface OutageWindow {
  startS: number;
  endS: number;
}

export const overlaps = (window: OutageWindow, startS: number, endS: number) =>
  startS < window.endS && endS > window.startS;

/**
 * The clock as the ruler writes it. A window that runs to the end of the
 * horizon ends at 24:00, not at the 00:00 the wrapped clock would print.
 */
export const windowClock = (
  seconds: number,
  horizonS: number,
  format: (seconds: number) => string,
) => (seconds >= horizonS ? `${Math.round(horizonS / 3600)}:00` : format(seconds));
