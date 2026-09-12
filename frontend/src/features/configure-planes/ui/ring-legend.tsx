'use client';

import { ArrowRight, Lock, Pencil } from 'lucide-react';
import { planeCommitStage } from '@/entities/scenario';
import { cn } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ScenarioDocument } from '@/shared/api';

interface RingLegendProps {
  scenario: ScenarioDocument;
  colors: Record<string, string>;
  /** The launch on screen, which decides which rings are in the picture. */
  stage: number;
  /** Launches whose angles are settled. */
  committed: number[];
  onSelectStage: (stage: number) => void;
}

/**
 * Which ring is which, and why its scales do or do not move.
 *
 * The rulers below stack every plane under one axis, which answers how far the
 * planes sit from each other but says nothing about them one at a time. Three
 * things can be true of a ring, and each disables its scales for a different
 * reason: its launch is settled, it is the one being designed now, or it flies
 * later and is therefore designed on its own launch. Saying which, in the
 * ring's own row, is what keeps a dimmed slider from reading as a fault.
 */
export function RingLegend({
  scenario,
  colors,
  stage,
  committed,
  onSelectStage,
}: RingLegendProps) {
  const { t } = useI18n();

  return (
    <div className="mb-2.5 space-y-px">
      {scenario.design.planes.map((plane) => {
        const commitStage = planeCommitStage(scenario, plane.id);
        const settled = committed.includes(commitStage);
        const later = commitStage > stage;
        const count = scenario.design.satellites.filter(
          (satellite) => satellite.plane_id === plane.id,
        ).length;

        const state = settled ? 'settled' : later ? 'later' : 'designing';
        const Icon = settled ? Lock : later ? ArrowRight : Pencil;

        return (
          <button
            key={plane.id}
            type="button"
            onClick={() => onSelectStage(commitStage)}
            title={t('deploy.ringGo', { stage: commitStage })}
            className={cn(
              'flex w-full items-center gap-2 py-0.5 text-left transition-colors focus-visible:outline-none',
              later ? 'opacity-50 hover:opacity-80' : 'hover:bg-white/[0.03]',
            )}
          >
            <span
              className="h-2.5 w-0.5 flex-shrink-0"
              style={{ background: colors[plane.id] ?? '#52525b' }}
            />
            <span className="font-data text-[11px] text-zinc-200">{plane.id}</span>
            <span className="truncate font-label text-[10px] text-zinc-500">
              {t('deploy.ringLaunch', { stage: commitStage })} · {t('deploy.sv', { count })} ·{' '}
              {t(
                state === 'settled'
                  ? 'deploy.ringSettled'
                  : state === 'later'
                    ? 'deploy.ringLater'
                    : 'deploy.ringDesigning',
                { stage: commitStage },
              )}
            </span>
            <Icon
              size={10}
              aria-hidden="true"
              className={cn('ml-auto flex-shrink-0', settled ? 'text-zinc-400' : 'text-zinc-600')}
            />
          </button>
        );
      })}
    </div>
  );
}
