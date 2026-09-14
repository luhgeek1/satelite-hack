import type { StudioTab } from '@/entities/session';
import type { TranslationKey } from '@/shared/i18n';

export type TourId = 'studio' | 'deployment';

export interface TourStep {

  target: string;
  title: TranslationKey;
  text: TranslationKey;

  tab?: StudioTab;
}









const studio: TourStep[] = [
  { target: 'globe', title: 'tour.globeTitle', text: 'tour.globeText', tab: 'simulation' },
  { target: 'health', title: 'tour.healthTitle', text: 'tour.healthText' },
  { target: 'timeline', title: 'tour.timeTitle', text: 'tour.timeText' },
  { target: 'window-tool', title: 'tour.windowTitle', text: 'tour.windowText' },
  { target: 'deploy', title: 'tour.deployTitle', text: 'tour.deployText' },
  { target: 'deploy-find', title: 'tour.findTitle', text: 'tour.findText' },
  { target: 'planes', title: 'tour.planesTitle', text: 'tour.planesText' },
  {
    target: 'resilience-verdict',
    title: 'tour.resVerdictTitle',
    text: 'tour.resVerdictText',
    tab: 'resilience',
  },
  { target: 'critical-list', title: 'tour.resListTitle', text: 'tour.resListText', tab: 'resilience' },
  { target: 'save', title: 'tour.saveTitle', text: 'tour.saveText', tab: 'simulation' },
  { target: 'help', title: 'tour.helpTitle', text: 'tour.helpText', tab: 'simulation' },
];






const deployment: TourStep[] = [
  { target: 'deploy-table', title: 'tour.dTableTitle', text: 'tour.dTableText', tab: 'simulation' },
  { target: 'deploy-step', title: 'tour.dStepTitle', text: 'tour.dStepText' },
  { target: 'deploy-find', title: 'tour.dFindTitle', text: 'tour.dFindText' },
  { target: 'deploy-fix', title: 'tour.dFixTitle', text: 'tour.dFixText' },
  { target: 'planes', title: 'tour.dRingsTitle', text: 'tour.dRingsText' },
  { target: 'deploy-open', title: 'tour.dPanelTitle', text: 'tour.dPanelText' },
];

export const TOURS: Record<TourId, TourStep[]> = { studio, deployment };
