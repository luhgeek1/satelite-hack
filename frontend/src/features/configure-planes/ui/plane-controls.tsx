'use client';

import { useSession } from '@/entities/session';
import { ScaleCaption, ScaleRow, SCALE_GRID } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument } from '@/shared/api';

/**
 * Both angles run the full circle: the official validator takes [0, 360) and
 * the organisers confirmed there is no further constraint on either. The
 * upper bound stops one step short of 360 so a slider at the end still posts
 * a value the validator accepts.
 */
const ANGLE_STEP_DEG = 0.1;
const ANGLE_MAX_DEG = 360 - ANGLE_STEP_DEG;

/** Quarters of the turn: the stops an operator names, and where the majors fall. */
const ANGLE_STOPS = [0, 90, 180, 270];
const ANGLE_TICKS = 13;
const ANGLE_MAJOR_EVERY = 3;

const SCALES = [
  { key: 'raan' as const, label: 'RAAN' },
  { key: 'phase' as const, label: 'PHASE' },
];

interface PlaneControlsProps {
  scenario: ScenarioDocument;
  colors: Record<string, string>;
}

/**
 * Two scales, every plane on each.
 *
 * Grouped by parameter rather than by plane: the question an operator asks of
 * this block is how far one plane sits from another, and stacking the tracks
 * of a parameter under a single ruler answers it by alignment instead of by
 * reading a column of numbers. The quarter marks are labelled, so each ruler
 * also says what it counts in.
 */
export function PlaneControls({ scenario, colors }: PlaneControlsProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();

  return (
    <>
      <div className="space-y-3.5">
        {SCALES.map((scale) => (
          <div key={scale.key} className={SCALE_GRID}>
            <ScaleCaption label={scale.label} stops={ANGLE_STOPS} max={ANGLE_MAX_DEG} />

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
                  max={ANGLE_MAX_DEG}
                  step={ANGLE_STEP_DEG}
                  ticks={ANGLE_TICKS}
                  majorEvery={ANGLE_MAJOR_EVERY}
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

      {/* The ruler shows the span; what it cannot show is that nothing else
          constrains the pair, and that the reading takes typing. */}
      <p className="mt-2.5 font-label text-[11px] leading-relaxed text-zinc-500">
        {t('config.planesHint')}
        <span className="mt-1 block">{t('config.typeHint')}</span>
      </p>
    </>
  );
}
