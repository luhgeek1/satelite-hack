import type { GroundSiteRole, RouteDto, ScenarioDocument } from '@/shared/api';

export interface GroundSiteView {
  id: string;
  name: string;
  role: GroundSiteRole;
  lat: number;
  lon: number;
}

export const groundSitesOf = (scenario: ScenarioDocument | undefined): GroundSiteView[] =>
  (scenario?.ground_sites ?? []).map((site) => ({
    id: site.id,
    name: site.name,
    role: site.role,
    lat: site.lat_deg,
    lon: site.lon_deg,
  }));

export const clientsOf = (scenario: ScenarioDocument | undefined) =>
  groundSitesOf(scenario).filter((site) => site.role === 'client');

export const gatewaysOf = (scenario: ScenarioDocument | undefined) =>
  groundSitesOf(scenario).filter((site) => site.role === 'gateway');

export const routeFor = (routes: RouteDto[] | undefined, clientId: string | null) =>
  clientId ? routes?.find((route) => route.client_id === clientId) : undefined;
