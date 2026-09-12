import type {
  GroundSiteRole,
  RouteDto,
  ScenarioDocument,
  SimulationConfig,
  SiteConditionsDto,
} from '@/shared/api';

export interface GroundSiteView {
  id: string;
  name: string;
  role: GroundSiteRole;
  lat: number;
  lon: number;
  /** The surroundings block the scenario file itself carries, if any. */
  fileConditions: SiteConditionsDto | null;
}

export const groundSitesOf = (scenario: ScenarioDocument | undefined): GroundSiteView[] =>
  (scenario?.ground_sites ?? []).map((site) => ({
    id: site.id,
    name: site.name,
    role: site.role,
    lat: site.lat_deg,
    lon: site.lon_deg,
    fileConditions: site.site_conditions ?? null,
  }));

/**
 * What a site's surroundings are for the run being configured: the session's
 * override when one is set (including an explicit `null`), else the file's.
 */
export const effectiveSiteConditions = (
  site: GroundSiteView,
  config: SimulationConfig,
): SiteConditionsDto | null =>
  config.sites && site.id in config.sites ? config.sites[site.id] : site.fileConditions;

export const hasSiteOverride = (siteId: string, config: SimulationConfig): boolean =>
  Boolean(config.sites && siteId in config.sites);

export const clientsOf = (scenario: ScenarioDocument | undefined) =>
  groundSitesOf(scenario).filter((site) => site.role === 'client');

export const gatewaysOf = (scenario: ScenarioDocument | undefined) =>
  groundSitesOf(scenario).filter((site) => site.role === 'gateway');

export const routeFor = (routes: RouteDto[] | undefined, clientId: string | null) =>
  clientId ? routes?.find((route) => route.client_id === clientId) : undefined;
