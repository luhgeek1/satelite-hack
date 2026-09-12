const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export const normalizeLongitude = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

export interface TrackPoint {
  lat: number;
  lng: number;
}

export function groundTrackPoint(argumentOfLatitudeDeg: number, inclinationDeg: number): TrackPoint {
  const u = toRadians(argumentOfLatitudeDeg);
  const inclination = toRadians(inclinationDeg);

  const lat = toDegrees(Math.asin(Math.sin(inclination) * Math.sin(u)));
  const principal = toDegrees(Math.atan2(Math.cos(inclination) * Math.sin(u), Math.cos(u)));
  const lng = principal + 360 * Math.round((argumentOfLatitudeDeg - principal) / 360);

  return { lat, lng };
}

export function orbitTrack(
  inclinationDeg: number,
  raanDeg: number,
  earthRotationDeg: number,
  segments = 180,
): TrackPoint[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const u = (index / segments) * 360;
    const point = groundTrackPoint(u, inclinationDeg);
    return { lat: point.lat, lng: point.lng + raanDeg - earthRotationDeg };
  });
}

export const EARTH_RADIUS_KM = 6371;

/** Distance along the ground between two points, in kilometres. */
export function greatCircleKm(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
): number {
  const phiA = toRadians(latA);
  const phiB = toRadians(latB);
  const deltaPhi = toRadians(latB - latA);
  const deltaLambda = toRadians(lonB - lonA);

  const a =
    Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phiA) * Math.cos(phiB) * Math.sin(deltaLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Radius on the ground inside which a satellite clears the elevation mask.
 *
 * This is not a beam width — the case has no antenna model. A ground link
 * exists when the satellite sits at least `min_elevation_deg` above the local
 * horizon, and for a spherical Earth that condition is exactly a circle
 * centred on the sub-satellite point. Deriving it from the scenario's own two
 * numbers keeps the drawn circle meaning the same thing the engine tests.
 *
 * At the case values (550 km, 10 deg) this is 1664 km.
 */
export function contactRadiusKm(altitudeKm: number, minElevationDeg: number): number {
  const orbitRadius = EARTH_RADIUS_KM + altitudeKm;
  const elevation = toRadians(minElevationDeg);
  const centralAngle =
    Math.acos((EARTH_RADIUS_KM * Math.cos(elevation)) / orbitRadius) - elevation;

  return EARTH_RADIUS_KM * centralAngle;
}

/**
 * Straight-line distance to a satellite sitting exactly on the elevation mask —
 * the longest ground link the scenario allows. Distinct from `isl_range_km`,
 * which limits satellite-to-satellite hops and is given outright.
 */
export function maxSlantRangeKm(altitudeKm: number, minElevationDeg: number): number {
  const orbitRadius = EARTH_RADIUS_KM + altitudeKm;
  const elevation = toRadians(minElevationDeg);
  const horizontal = EARTH_RADIUS_KM * Math.cos(elevation);

  return Math.sqrt(orbitRadius * orbitRadius - horizontal * horizontal) - EARTH_RADIUS_KM * Math.sin(elevation);
}

const EARTH_SIDEREAL_DAY_S = 86164.09054;

export const earthRotationDeg = (tS: number, earthAngle0Deg: number) =>
  earthAngle0Deg + (360 * tS) / EARTH_SIDEREAL_DAY_S;
