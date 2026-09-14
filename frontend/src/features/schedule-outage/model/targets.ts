export type OutageKind = 'satellite' | 'gateway';


export interface OutageNode {
  id: string;

  detail: string;
}

export interface OutageTarget {
  kind: OutageKind;
  id: string;
}


export interface OutageWindow {
  startS: number;
  endS: number;
}

export const overlaps = (window: OutageWindow, startS: number, endS: number) =>
  startS < window.endS && endS > window.startS;





export const windowClock = (
  seconds: number,
  horizonS: number,
  format: (seconds: number) => string,
) => (seconds >= horizonS ? `${Math.round(horizonS / 3600)}:00` : format(seconds));
