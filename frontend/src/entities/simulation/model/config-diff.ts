import type { RoutingStrategy, ScenarioDocument, SimulationConfig } from '@/shared/api';
import type { Translate } from '@/shared/i18n';
import { normalizeConfig } from './run-input';

/** One parameter the engineer moved away from what the file says. */
export interface ConfigChange {
  id: string;
  label: string;
  from: string;
  to: string;
}

const DEFAULT_STRATEGY: RoutingStrategy = 'min_hops';

/**
 * Is the configuration on screen still the file as loaded?
 *
 * Cheap enough for a badge in the header: it needs the session state only, not
 * the scenario document, so it can be answered before the scenario has loaded.
 */
export const hasConfigChanges = (config: SimulationConfig, strategy: RoutingStrategy): boolean =>
  Object.keys(normalizeConfig(config)).length > 0 || strategy !== DEFAULT_STRATEGY;

const degrees = (value: number) => `${value.toFixed(1)}°`;

const profileToken = (t: Translate, profile: string | null) =>
  t(profile ? (`site.token.${profile}` as 'site.token.open') : 'site.token.open');

/**
 * Everything that differs between the scenario file and the run being configured.
 *
 * The file is the reference, not the previous run: the question the engineer
 * asks after an optimizer pass or half an hour of sliders is "what have I
 * actually changed", and the answer has to survive a reload and a tab switch.
 */
export function describeConfigChanges(
  scenario: ScenarioDocument | undefined,
  config: SimulationConfig,
  strategy: RoutingStrategy,
  t: Translate,
): ConfigChange[] {
  if (!scenario) return [];
  const changes: ConfigChange[] = [];

  if (config.launch_stage !== undefined && config.launch_stage !== scenario.design.launch_stage) {
    changes.push({
      id: 'launch_stage',
      label: t('changes.launchStage'),
      from: String(scenario.design.launch_stage),
      to: String(config.launch_stage),
    });
  }

  for (const plane of scenario.design.planes) {
    const override = config.planes?.[plane.id];
    if (!override) continue;

    if (override.raan_deg !== undefined && override.raan_deg !== plane.raan_deg) {
      changes.push({
        id: `${plane.id}.raan`,
        label: `${plane.id} RAAN`,
        from: degrees(plane.raan_deg),
        to: degrees(override.raan_deg),
      });
    }
    if (override.phase_deg !== undefined && override.phase_deg !== plane.phase_deg) {
      changes.push({
        id: `${plane.id}.phase`,
        label: `${plane.id} ${t('changes.phase')}`,
        from: degrees(plane.phase_deg),
        to: degrees(override.phase_deg),
      });
    }
  }

  if (config.failures && config.failures.length !== scenario.failures.length) {
    changes.push({
      id: 'failures',
      label: t('changes.failures'),
      from: String(scenario.failures.length),
      to: String(config.failures.length),
    });
  }

  if (config.gateway_outages && config.gateway_outages.length !== scenario.gateway_outages.length) {
    changes.push({
      id: 'gateway_outages',
      label: t('changes.gatewayOutages'),
      from: String(scenario.gateway_outages.length),
      to: String(config.gateway_outages.length),
    });
  }

  for (const [siteId, conditions] of Object.entries(config.sites ?? {})) {
    const site = scenario.ground_sites.find((item) => item.id === siteId);
    const before = site?.site_conditions?.profile ?? null;
    const after = conditions?.profile ?? null;
    if (before === after) continue;

    changes.push({
      id: `site.${siteId}`,
      label: t('changes.surroundings', { site: siteId }),
      from: profileToken(t, before),
      to: profileToken(t, after),
    });
  }

  // The environment block is a sensitivity study rather than a design change,
  // but it still has to show up here — a forgotten ISL sweep silently changes
  // every number on the screen.
  const environment = [
    ['isl_range_km', t('sweep.isl.label'), scenario.environment.isl_range_km],
    ['min_elevation_deg', t('sweep.elev.label'), scenario.environment.min_elevation_deg],
    ['altitude_km', t('sweep.alt.label'), scenario.environment.altitude_km],
    ['inclination_deg', t('changes.inclination'), scenario.environment.inclination_deg],
  ] as const;

  for (const [key, label, fileValue] of environment) {
    const value = config[key];
    if (value === undefined || value === fileValue) continue;
    changes.push({ id: key, label, from: String(fileValue), to: String(value) });
  }

  if (strategy !== DEFAULT_STRATEGY) {
    changes.push({
      id: 'strategy',
      label: t('changes.strategy'),
      from: t('changes.minHops'),
      to: t('changes.minDistance'),
    });
  }

  return changes;
}
