import type { StudioTab } from '@/entities/session';
import type { TranslationKey } from '@/shared/i18n';

export type TourId = 'studio' | 'deployment';

export interface TourStep {
  /** The `data-tour` attribute of the element this step is about. */
  target: string;
  title: TranslationKey;
  text: TranslationKey;
  /** Switched to before the step is shown, when the step lives on another tab. */
  tab?: StudioTab;
}

/**
 * The path through the studio, once.
 *
 * One sentence a step, and only the things somebody has to know before they
 * can do the job: what they are looking at, what the number to beat is, how
 * time works here, how to break something on purpose, and where the campaign
 * is planned. Everything else the interface can explain when it is reached.
 */
const studio: TourStep[] = [
  { target: 'globe', title: 'tour.globeTitle', text: 'tour.globeText', tab: 'simulation' },
  { target: 'health', title: 'tour.healthTitle', text: 'tour.healthText' },
  { target: 'timeline', title: 'tour.timeTitle', text: 'tour.timeText' },
  { target: 'window-tool', title: 'tour.windowTitle', text: 'tour.windowText' },
  { target: 'deploy', title: 'tour.deployTitle', text: 'tour.deployText' },
  { target: 'planes', title: 'tour.planesTitle', text: 'tour.planesText' },
  { target: 'save', title: 'tour.saveTitle', text: 'tour.saveText' },
  { target: 'help', title: 'tour.helpTitle', text: 'tour.helpText' },
];

/**
 * The deployment group on its own, for the question it actually raises: what
 * am I supposed to do with three launches. Reached from the group's own
 * button, so it is asked for rather than served unprompted.
 */
const deployment: TourStep[] = [
  { target: 'deploy-table', title: 'tour.dTableTitle', text: 'tour.dTableText', tab: 'simulation' },
  { target: 'deploy-step', title: 'tour.dStepTitle', text: 'tour.dStepText' },
  { target: 'deploy-find', title: 'tour.dFindTitle', text: 'tour.dFindText' },
  { target: 'deploy-fix', title: 'tour.dFixTitle', text: 'tour.dFixText' },
  { target: 'planes', title: 'tour.dRingsTitle', text: 'tour.dRingsText' },
  { target: 'deploy-open', title: 'tour.dPanelTitle', text: 'tour.dPanelText' },
];

export const TOURS: Record<TourId, TourStep[]> = { studio, deployment };
