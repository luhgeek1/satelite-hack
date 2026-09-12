import type { PlaneConfig, ScenarioDocument, SimulationConfig } from '@/shared/api';

/** A half turn: a plane covers its ascending and descending passes alike, so two
 *  planes 180 degrees apart in RAAN trace the same ground swath. */
const RAAN_PERIOD_DEG = 180;

/** How far a gap may stray from the ideal before the spread stops reading as even. */
const EVEN_TOLERANCE = 0.15;

/**
 * The launch that fixes a plane's orbit.
 *
 * A plane's angles are chosen when its first satellites are put there and
 * cannot be changed afterwards, so the earliest batch among them is the moment
 * of commitment. Derived from the file rather than assumed: the official data
 * happens to fly one whole plane per launch, and a jury file need not.
 */
export function planeCommitStage(scenario: ScenarioDocument, planeId: string): number {
  const batches = scenario.design.satellites
    .filter((satellite) => satellite.plane_id === planeId)
    .map((satellite) => satellite.launch_batch);

  return batches.length ? Math.min(...batches) : 1;
}

/** Planes with at least one satellite in orbit at this launch stage. */
export function planesAtStage(scenario: ScenarioDocument, stage: number): string[] {
  return scenario.design.planes
    .filter((plane) =>
      scenario.design.satellites.some(
        (satellite) => satellite.plane_id === plane.id && satellite.launch_batch <= stage,
      ),
    )
    .map((plane) => plane.id);
}

/** Satellites in orbit at this launch stage. */
export const satellitesAtStage = (scenario: ScenarioDocument, stage: number): number =>
  scenario.design.satellites.filter((satellite) => satellite.launch_batch <= stage).length;

export const planeRaanDeg = (
  scenario: ScenarioDocument,
  planeId: string,
  config: SimulationConfig,
): number => {
  const plane = scenario.design.planes.find((item) => item.id === planeId);
  const override: PlaneConfig | undefined = config.planes?.[planeId];
  return override?.raan_deg ?? plane?.raan_deg ?? 0;
};

export interface RaanSpread {
  /** RAAN of each plane folded into one half turn, ascending. */
  folded: number[];
  /** Gap to the next plane around the circle, in the same order. */
  gaps: number[];
  /** What every gap would be if the planes were spread evenly. */
  idealGap: number;
  even: boolean;
}

/**
 * How the planes are spread around the Earth.
 *
 * Measured on the official scenario, every configuration reaching 96% or better
 * spreads its three planes 60 degrees apart modulo 180, and the one that does
 * not reaches 84%. So the spread is worth reporting on its own: it is a
 * property of the design an engineer can read before running anything.
 */
export function raanSpread(scenario: ScenarioDocument, config: SimulationConfig): RaanSpread | null {
  const planes = scenario.design.planes;
  if (planes.length < 2) return null;

  const folded = planes
    .map((plane) => ((planeRaanDeg(scenario, plane.id, config) % RAAN_PERIOD_DEG) + RAAN_PERIOD_DEG) % RAAN_PERIOD_DEG)
    .sort((a, b) => a - b);

  const gaps = folded.map((value, index) => {
    const next = index + 1 < folded.length ? folded[index + 1] : folded[0] + RAAN_PERIOD_DEG;
    return next - value;
  });

  const idealGap = RAAN_PERIOD_DEG / planes.length;
  const even = gaps.every((gap) => Math.abs(gap - idealGap) <= idealGap * EVEN_TOLERANCE);

  return { folded, gaps, idealGap, even };
}
