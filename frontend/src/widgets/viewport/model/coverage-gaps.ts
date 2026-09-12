import type { GroundSiteView } from '@/entities/ground-site';
import type { SatelliteView } from '@/entities/satellite';
import type { RouteTrace } from '@/entities/simulation';
import { greatCircleKm } from '@/shared/lib';

export interface CoverageGap {
  id: string;
  lat: number;
  lon: number;
  /** How far outside this node's footprint the site sits, in kilometres. */
  shortfallKm: number;
}

/** Enough to show the hole the site sits in without drawing a spirograph. */
const NEAREST = 3;

/**
 * The footprints that come closest to a site with nothing in view.
 *
 * A terminal turns red for four different reasons, and only one of them is
 * geometric: no satellite clears its elevation mask. For that one the answer
 * is a picture — the nearest footprints drawn where they actually fall, with
 * the site outside all of them. Nodes whose circle does reach the site are
 * left out: the claim the drawing makes is "these do not reach", and a
 * covering circle would contradict it. That happens when the surroundings,
 * not the distance, are what hides the sky, and the masked link already says
 * so in its own colour.
 */
export function coverageGaps(
  site: GroundSiteView | undefined,
  trace: RouteTrace | undefined,
  satellites: SatelliteView[],
  contactRadiusKm: number,
): CoverageGap[] {
  if (!site || !trace || trace.available || trace.reason !== 'no_visible_satellite') return [];

  return satellites
    .filter((satellite) => satellite.deployed && !satellite.failed)
    .map((satellite) => ({
      id: satellite.id,
      lat: satellite.lat,
      lon: satellite.lon,
      shortfallKm: greatCircleKm(site.lat, site.lon, satellite.lat, satellite.lon) - contactRadiusKm,
    }))
    .filter((gap) => gap.shortfallKm > 0)
    .sort((a, b) => a.shortfallKm - b.shortfallKm)
    .slice(0, NEAREST);
}
