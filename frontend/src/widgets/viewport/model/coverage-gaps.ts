import type { GroundSiteView } from '@/entities/ground-site';
import type { SatelliteView } from '@/entities/satellite';
import type { RouteTrace } from '@/entities/simulation';
import { greatCircleKm } from '@/shared/lib';

export interface CoverageGap {
  id: string;
  lat: number;
  lon: number;

  shortfallKm: number;
}


const NEAREST = 3;













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
