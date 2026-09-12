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

const EARTH_SIDEREAL_DAY_S = 86164.09054;

export const earthRotationDeg = (tS: number, earthAngle0Deg: number) =>
  earthAngle0Deg + (360 * tS) / EARTH_SIDEREAL_DAY_S;
