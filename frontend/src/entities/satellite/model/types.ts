import type { SatelliteImpact, SatelliteState, ScenarioDocument, SnapshotEdge } from '@/shared/api';

export interface SatelliteView {
  id: string;
  planeId: string;
  slotDeg: number;
  launchBatch: 1 | 2 | 3;
  lat: number;
  lon: number;
  altitudeKm: number;
  active: boolean;
  failed: boolean;
  deployed: boolean;
  criticality: number;
  availabilityImpact: number;
  color: string;
}

/** `masked`: a ground link geometry admits but the site's surroundings hide. */
export type SatelliteLinkKind = SnapshotEdge['type'] | 'masked';

export interface LinkView {
  source: string;
  target: string;
  kind: SatelliteLinkKind;
  distanceKm: number;
}

interface BuildInput {
  scenario: ScenarioDocument | undefined;
  states: SatelliteState[] | undefined;
  launchStage: number;
  failedIds: Set<string>;
  impacts: Map<string, SatelliteImpact>;
  colors: Record<string, string>;
}

export function buildSatelliteViews({
  scenario,
  states,
  launchStage,
  failedIds,
  impacts,
  colors,
}: BuildInput): SatelliteView[] {
  if (!scenario) return [];

  const stateById = new Map((states ?? []).map((state) => [state.id, state]));

  return scenario.design.satellites.map((sat) => {
    const state = stateById.get(sat.id);
    const impact = impacts.get(sat.id);
    const deployed = sat.launch_batch <= launchStage;

    return {
      id: sat.id,
      planeId: sat.plane_id,
      slotDeg: sat.slot_deg,
      launchBatch: sat.launch_batch,
      lat: state?.lat_deg ?? 0,
      lon: state?.lon_deg ?? 0,
      altitudeKm: state?.alt_km ?? scenario.environment.altitude_km,
      active: state?.active ?? false,
      failed: failedIds.has(sat.id),
      deployed,
      criticality: impact?.criticality ?? 0,
      availabilityImpact: impact?.worst_availability_drop ?? 0,
      color: colors[sat.plane_id] ?? '#71717a',
    };
  });
}

export function buildLinkViews(
  edges: SnapshotEdge[] | undefined,
  masked: Record<string, string[]> | undefined = undefined,
): LinkView[] {
  const links: LinkView[] = (edges ?? []).map((edge) => ({
    source: edge.source,
    target: edge.target,
    kind: edge.type,
    distanceKm: edge.distance_km,
  }));

  for (const [siteId, satelliteIds] of Object.entries(masked ?? {})) {
    for (const satelliteId of satelliteIds) {
      links.push({ source: siteId, target: satelliteId, kind: 'masked', distanceKm: 0 });
    }
  }

  return links;
}

export const neighboursOf = (links: LinkView[], satelliteId: string): string[] =>
  links
    .filter((link) => link.kind === 'isl' && (link.source === satelliteId || link.target === satelliteId))
    .map((link) => (link.source === satelliteId ? link.target : link.source));
