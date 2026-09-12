'use client';

import { Lock, Unlock } from 'lucide-react';
import {
  isPlaneLocked,
  planeCommitStage,
  setPlaneLocked,
  type PlaneLock,
} from '@/entities/scenario';
import { cn } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument } from '@/shared/api';

interface RingLegendProps {
  scenario: ScenarioDocument;
  colors: Record<string, string>;
  /** Launch stage on screen, which decides what counts as already in orbit. */
  stage: number;
  locks: PlaneLock[];
  onLocksChange: (locks: PlaneLock[]) => void;
}

/**
 * Which ring is which, and whether it is still a design choice.
 *
 * The scales above stack every plane under one ruler, which answers how far
 * the planes sit from each other but says nothing about them individually. Two
 * things about a ring decide whether moving its scale means anything: the
 * launch that puts it up, and whether that launch has already flown. A ring
 * still on the ground can be designed freely; one in orbit keeps the angles it
 * launched with, and the lock is how that is stated to every search.
 */
export function RingLegend({ scenario, colors, stage, locks, onLocksChange }: RingLegendProps) {
  const { t } = useI18n();

  return (
    <div className="mb-2.5 space-y-px">
      {scenario.design.planes.map((plane) => {
        const commitStage = planeCommitStage(scenario, plane.id);
        const flying = commitStage <= stage;
        const locked = isPlaneLocked(locks, plane.id);
        const count = scenario.design.satellites.filter(
          (satellite) => satellite.plane_id === plane.id,
        ).length;

        return (
          <div
            key={plane.id}
            className={cn(
              'flex items-center gap-2 py-0.5 transition-opacity',
              !flying && 'opacity-45',
            )}
          >
            <span
              className="h-2.5 w-0.5 flex-shrink-0"
              style={{ background: colors[plane.id] ?? '#52525b' }}
            />
            <span className="font-data text-[11px] text-zinc-200">{plane.id}</span>
            <span className="truncate font-label text-[10px] text-zinc-500">
              {t('deploy.ringLaunch', { stage: commitStage })} ·{' '}
              {t('deploy.sv', { count })} ·{' '}
              {t(flying ? 'deploy.ringInOrbit' : 'deploy.ringWaiting')}
            </span>

            <button
              type="button"
              onClick={() => onLocksChange(setPlaneLocked(locks, plane.id, !locked))}
              aria-pressed={locked}
              title={t(locked ? 'deploy.ringCommitted' : 'deploy.ringFree')}
              className={cn(
                'ml-auto flex-shrink-0 transition-colors focus-visible:outline-none',
                locked ? 'text-zinc-200' : 'text-zinc-600 hover:text-zinc-300',
              )}
            >
              {locked ? <Lock size={11} /> : <Unlock size={11} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
