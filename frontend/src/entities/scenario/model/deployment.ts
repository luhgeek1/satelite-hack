import type { PlaneConfig, ScenarioDocument, SimulationConfig } from '@/shared/api';
import { launchStages } from './types';



const RAAN_PERIOD_DEG = 180;


const EVEN_TOLERANCE = 0.15;









export interface PlaneLock {
  planeId: string;
  raanLocked: boolean;
  phaseLocked: boolean;
}


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









export function planeCommitStage(scenario: ScenarioDocument, planeId: string): number {
  const batches = scenario.design.satellites
    .filter((satellite) => satellite.plane_id === planeId)
    .map((satellite) => satellite.launch_batch);

  return batches.length ? Math.min(...batches) : 1;
}


export function planesAtStage(scenario: ScenarioDocument, stage: number): string[] {
  return scenario.design.planes
    .filter((plane) =>
      scenario.design.satellites.some(
        (satellite) => satellite.plane_id === plane.id && satellite.launch_batch <= stage,
      ),
    )
    .map((plane) => plane.id);
}


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

  folded: number[];

  gaps: number[];

  idealGap: number;
  even: boolean;
}









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


export const locksFromCommitted = (
  scenario: ScenarioDocument,
  committed: number[],
): PlaneLock[] =>
  scenario.design.planes.map((plane) => {
    const held = committed.includes(planeCommitStage(scenario, plane.id));
    return { planeId: plane.id, raanLocked: held, phaseLocked: held };
  });


export const firstOpenStage = (scenario: ScenarioDocument, committed: number[]): number => {
  const stages = launchStages(scenario).map((info) => info.stage);
  return stages.find((stage) => !committed.includes(stage)) ?? stages[stages.length - 1] ?? 1;
};


export const isRingSettled = (
  scenario: ScenarioDocument,
  committed: number[],
  planeId: string,
): boolean => committed.includes(planeCommitStage(scenario, planeId));
