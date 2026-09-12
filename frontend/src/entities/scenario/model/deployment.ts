import type { PlaneConfig, ScenarioDocument, SimulationConfig } from '@/shared/api';
import { launchStages } from './types';

/** A half turn: a plane covers its ascending and descending passes alike, so two
 *  planes 180 degrees apart in RAAN trace the same ground swath. */
const RAAN_PERIOD_DEG = 180;

/** How far a gap may stray from the ideal before the spread stops reading as even. */
const EVEN_TOLERANCE = 0.15;

/**
 * Which of a plane's two angles are held against a search.
 *
 * A plane already in orbit is not a design choice any more: its angles were
 * fixed when it flew. The same mechanism also serves a constraint the tool
 * cannot see — an agreed slot, a signed contract — which is why the two angles
 * lock separately rather than the plane locking as a whole.
 */
export interface PlaneLock {
  planeId: string;
  raanLocked: boolean;
  phaseLocked: boolean;
}

/** Every plane free to move: what a search assumes unless told otherwise. */
export const freeLocks = (planeIds: string[]): PlaneLock[] =>
  planeIds.map((planeId) => ({ planeId, raanLocked: false, phaseLocked: false }));

export const isPlaneLocked = (locks: PlaneLock[], planeId: string): boolean => {
  const lock = locks.find((item) => item.planeId === planeId);
  return Boolean(lock?.raanLocked && lock?.phaseLocked);
};

export const setPlaneLocked = (
  locks: PlaneLock[],
  planeId: string,
  locked: boolean,
): PlaneLock[] =>
  locks.map((lock) =>
    lock.planeId === planeId ? { ...lock, raanLocked: locked, phaseLocked: locked } : lock,
  );

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

/**
 * Hold every launch that is settled, free the rest.
 *
 * Two different things settle a ring. One is the campaign: by the time a later
 * launch is designed, the earlier ones have flown and their angles cannot be
 * revisited. The other is the engineer saying so — a launch marked as fixed is
 * a decision taken, and nothing may move it until the decision is withdrawn.
 */
export const locksForPlanning = (
  scenario: ScenarioDocument,
  committed: number[],
  stage: number,
): PlaneLock[] =>
  scenario.design.planes.map((plane) => {
    const commitStage = planeCommitStage(scenario, plane.id);
    const held = commitStage < stage || committed.includes(commitStage);
    return { planeId: plane.id, raanLocked: held, phaseLocked: held };
  });

/** What the campaign holds right now, with no launch being planned. */
export const locksFromCommitted = (
  scenario: ScenarioDocument,
  committed: number[],
): PlaneLock[] =>
  scenario.design.planes.map((plane) => {
    const held = committed.includes(planeCommitStage(scenario, plane.id));
    return { planeId: plane.id, raanLocked: held, phaseLocked: held };
  });

/** The first launch still open for design, or the last one when all are fixed. */
export const firstOpenStage = (scenario: ScenarioDocument, committed: number[]): number => {
  const stages = launchStages(scenario).map((info) => info.stage);
  return stages.find((stage) => !committed.includes(stage)) ?? stages[stages.length - 1] ?? 1;
};

/** Whether this ring's angles may still be moved, by a search or by hand. */
export const isRingSettled = (
  scenario: ScenarioDocument,
  committed: number[],
  planeId: string,
): boolean => committed.includes(planeCommitStage(scenario, planeId));
