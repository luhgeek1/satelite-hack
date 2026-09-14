'use client';

import { planeRaanDeg, raanSpread } from '@/entities/scenario';
import type { ScenarioDocument, SimulationConfig } from '@/shared/api';

const SIZE = 64;
const RADIUS = 26;
const CENTRE = SIZE / 2;









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


    const radians = ((deg * 2 - 90) * Math.PI) / 180;
    return {
      x: CENTRE + RADIUS * Math.cos(radians),
      y: CENTRE + RADIUS * Math.sin(radians),
    };
  };

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="flex-shrink-0" aria-hidden="true">
      <circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill="none" stroke="#1f1f23" strokeWidth={1} />


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
