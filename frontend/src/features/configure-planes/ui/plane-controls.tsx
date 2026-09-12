'use client';

import { useSession } from '@/entities/session';
import { ScaleCaption, ScaleRow, SCALE_GRID } from '@/shared/ui';
import type { ScenarioDocument } from '@/shared/api';

interface PlaneControlsProps {
  scenario: ScenarioDocument;
  colors: Record<string, string>;
}

/**
 * Two scales, three planes on each.
 *
 * Grouped by parameter rather than by plane: the question an operator asks of
 * this block is how far one plane sits from another, and stacking the three
 * tracks under a single ruler answers it by alignment instead of by reading
 * six numbers. Each ruler also states its own span, which is what the
 * sentence underneath used to do in prose.
 */
const SCALES = [
  {
    key: 'raan' as const,
    label: 'RAAN',
    max: 359,
    step: 1,
    ticks: 13,
    majorEvery: 3,
    // 270 keeps its tick but loses its label: at this width it and the span
    // collide, and the span is the one that has to be legible.
    stops: [0, 90, 180, 359],
  },
  {
    key: 'phase' as const,
    label: 'PHASE',
    max: 22.5,
    step: 0.5,
    ticks: 10,
    majorEvery: 3,
    stops: [0, 7.5, 15, 22.5],
  },
];

export function PlaneControls({ scenario, colors }: PlaneControlsProps) {
  const { state, dispatch } = useSession();

  return (
    <div className="space-y-3.5">
      {SCALES.map((scale) => (
        <div key={scale.key} className={SCALE_GRID}>
          <ScaleCaption label={scale.label} stops={scale.stops} max={scale.max} />

          {scenario.design.planes.map((plane) => {
            const override = state.config.planes?.[plane.id];
            const value =
              scale.key === 'raan'
                ? (override?.raan_deg ?? plane.raan_deg)
                : (override?.phase_deg ?? plane.phase_deg);

            return (
              <ScaleRow
                key={plane.id}
                id={`${plane.id}-${scale.key}`}
                label={plane.id}
                accent={colors[plane.id]}
                value={value}
                max={scale.max}
                step={scale.step}
                ticks={scale.ticks}
                majorEvery={scale.majorEvery}
                onChange={(next) =>
                  dispatch(
                    scale.key === 'raan'
                      ? { type: 'setPlane', planeId: plane.id, raanDeg: next }
                      : { type: 'setPlane', planeId: plane.id, phaseDeg: next },
                  )
                }
                onCommit={() => dispatch({ type: 'commitConfig' })}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
