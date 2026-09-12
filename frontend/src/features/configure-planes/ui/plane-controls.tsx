'use client';

import { useSession } from '@/entities/session';
import { ScaleRow } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument } from '@/shared/api';

interface PlaneControlsProps {
  scenario: ScenarioDocument;
  colors: Record<string, string>;
}

export function PlaneControls({ scenario, colors }: PlaneControlsProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();

  return (
    <>
      <div className="space-y-3">
        {scenario.design.planes.map((plane) => {
          const override = state.config.planes?.[plane.id];
          const raan = override?.raan_deg ?? plane.raan_deg;
          const phase = override?.phase_deg ?? plane.phase_deg;
          const count = scenario.design.satellites.filter((sat) => sat.plane_id === plane.id).length;

          return (
            <div key={plane.id}>
              <div className="flex items-center gap-2 border-b border-rule pb-1">
                <span className="h-2.5 w-0.5" style={{ background: colors[plane.id] }} />
                <span className="font-data text-[11px] text-zinc-200">{plane.id}</span>
                <span className="ml-auto font-data text-[10px] tabular-nums text-zinc-500">{t('config.satellitesInPlane', { count })}</span>
              </div>

              <div className="mt-1.5 space-y-1">
                <ScaleRow
                  id={`${plane.id}-raan`}
                  label="RAAN"
                  value={raan}
                  max={359}
                  step={1}
                  ticks={13}
                  majorEvery={3}
                  onChange={(value) => dispatch({ type: 'setPlane', planeId: plane.id, raanDeg: value })}
                />
                <ScaleRow
                  id={`${plane.id}-phase`}
                  label="PHASE"
                  value={phase}
                  max={22.5}
                  step={0.5}
                  ticks={10}
                  majorEvery={3}
                  onChange={(value) => dispatch({ type: 'setPlane', planeId: plane.id, phaseDeg: value })}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 font-label text-[11px] leading-relaxed text-zinc-500">
        {t('config.planesHint')}
        <span className="mt-1 block">{t('config.typeHint')}</span>
      </p>
    </>
  );
}
