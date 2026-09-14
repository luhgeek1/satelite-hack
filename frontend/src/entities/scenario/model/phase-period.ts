import type { FailureDto, ScenarioDocument } from '@/shared/api';

const FULL_TURN = 360;
const SPACING_TOLERANCE_DEG = 1e-6;




















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
