'use client';

import { useSession } from '@/entities/session';
import { planeCommitStage } from '@/entities/scenario';
import { ScaleCaption, ScaleRow, SCALE_GRID } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument } from '@/shared/api';
import { RingLegend } from './ring-legend';







const ANGLE_STEP_DEG = 0.1;
const ANGLE_MAX_DEG = 360 - ANGLE_STEP_DEG;


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

  stage: number;

  committed: number[];
  onSelectStage: (stage: number) => void;
}










export function PlaneControls({
  scenario,
  colors,
  stage,
  committed,
  onSelectStage,
}: PlaneControlsProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();

  return (
    <>
      <RingLegend
        scenario={scenario}
        colors={colors}
        stage={stage}
        committed={committed}
        onSelectStage={onSelectStage}
      />

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





              const commitStage = planeCommitStage(scenario, plane.id);
              const settled = committed.includes(commitStage);
              const later = commitStage > stage;

              return (
                <ScaleRow
                  key={plane.id}
                  id={`${plane.id}-${scale.key}`}
                  label={plane.id}
                  accent={colors[plane.id]}
                  locked={settled}
                  disabled={later}
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



      <p className="mt-2.5 font-label text-[11px] leading-relaxed text-zinc-500">
        {t('config.planesHint')}
      </p>
    </>
  );
}
