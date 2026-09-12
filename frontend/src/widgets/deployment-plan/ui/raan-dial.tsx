'use client';

import { planeRaanDeg, raanSpread } from '@/entities/scenario';
import type { ScenarioDocument, SimulationConfig } from '@/shared/api';

const SIZE = 64;
const RADIUS = 26;
const CENTRE = SIZE / 2;

/**
 * Where the orbital planes sit around the Earth, folded into a half turn.
 *
 * A plane flies its ascending and descending passes alike, so two planes 180
 * degrees apart in RAAN cover the same ground and the useful picture is a half
 * circle, not a full one. Evenly spaced spokes are what a working end state
 * looks like; a cluster is the failure this panel is there to catch.
 */
export function RaanDial({
  scenario,
  config,
  colors,
}: {
  scenario: ScenarioDocument;
  config: SimulationConfig;
  colors: Record<string, string>;
}) {
  const spread = raanSpread(scenario, config);
  if (!spread) return null;

  const spoke = (deg: number) => {
    // Folded RAAN runs over half a turn, so it is drawn over half a turn:
    // 0 degrees points up and 180 points down the other side.
    const radians = ((deg * 2 - 90) * Math.PI) / 180;
    return {
      x: CENTRE + RADIUS * Math.cos(radians),
      y: CENTRE + RADIUS * Math.sin(radians),
    };
  };

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="flex-shrink-0" aria-hidden="true">
      <circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill="none" stroke="#1f1f23" strokeWidth={1} />

      {/* Where the spokes would sit if the planes were spread evenly. */}
      {spread.folded.map((_, index) => {
        const point = spoke(index * spread.idealGap);
        return (
          <line
            key={`ideal-${index}`}
            x1={CENTRE}
            y1={CENTRE}
            x2={point.x}
            y2={point.y}
            stroke="#2e2e34"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        );
      })}

      {scenario.design.planes.map((plane) => {
        const folded = ((planeRaanDeg(scenario, plane.id, config) % 180) + 180) % 180;
        const point = spoke(folded);
        return (
          <g key={plane.id}>
            <line
              x1={CENTRE}
              y1={CENTRE}
              x2={point.x}
              y2={point.y}
              stroke={colors[plane.id] ?? '#a1a1aa'}
              strokeWidth={2}
            />
            <circle cx={point.x} cy={point.y} r={2.5} fill={colors[plane.id] ?? '#a1a1aa'} />
          </g>
        );
      })}

      <circle cx={CENTRE} cy={CENTRE} r={2} fill="#3f3f46" />
    </svg>
  );
}
