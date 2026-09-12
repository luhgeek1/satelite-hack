import { PLANE_PALETTE } from '@/shared/config';
import type { ScenarioDocument } from '@/shared/api';

export function planeColorMap(scenario: ScenarioDocument | undefined): Record<string, string> {
  if (!scenario) return {};

  return Object.fromEntries(
    scenario.design.planes.map((plane, index) => [plane.id, PLANE_PALETTE[index % PLANE_PALETTE.length]]),
  );
}
