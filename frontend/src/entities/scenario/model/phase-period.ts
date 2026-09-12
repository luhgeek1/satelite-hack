import type { FailureDto, ScenarioDocument } from '@/shared/api';

const FULL_TURN = 360;
const SPACING_TOLERANCE_DEG = 1e-6;

/**
 * How far a plane's phase has to move before the constellation repeats itself.
 *
 * Both angles are free over the whole circle — the organisers confirmed there
 * is no other constraint — but when a plane's satellites sit at uniform slots,
 * shifting the phase by exactly one slot maps the set onto itself and every
 * metric comes out identical. A search that sweeps 0–360° would then spend
 * most of its budget re-measuring the same geometry, so the optimizer sweeps
 * one period instead. Two things break that symmetry and widen the period
 * back to a full turn:
 *
 * - slots that are not evenly spaced (a jury file may lay a plane out anyway
 *   it likes), because then no shift is a pure relabelling;
 * - a failure window on any satellite in the plane, because the failed slot is
 *   a specific place on the ring and a shift moves it.
 *
 * Only satellites deployed at the given launch stage take part, matching what
 * the simulation actually flies.
 */
export function phasePeriodDeg(
  scenario: ScenarioDocument,
  planeId: string,
  options: { launchStage?: number; failures?: FailureDto[] } = {},
): number {
  const stage = options.launchStage ?? scenario.design.launch_stage;
  const flying = scenario.design.satellites.filter(
    (sat) => sat.plane_id === planeId && sat.launch_batch <= stage,
  );
  if (flying.length < 2) return FULL_TURN;

  const failedIds = new Set([...scenario.failures, ...(options.failures ?? [])].map((f) => f.satellite_id));
  if (flying.some((sat) => failedIds.has(sat.id))) return FULL_TURN;

  const slots = flying
    .map((sat) => ((sat.slot_deg % FULL_TURN) + FULL_TURN) % FULL_TURN)
    .sort((a, b) => a - b);
  const spacing = FULL_TURN / slots.length;

  for (let index = 0; index < slots.length; index += 1) {
    const next = index + 1 < slots.length ? slots[index + 1] : slots[0] + FULL_TURN;
    if (Math.abs(next - slots[index] - spacing) > SPACING_TOLERANCE_DEG) return FULL_TURN;
  }

  return spacing;
}
