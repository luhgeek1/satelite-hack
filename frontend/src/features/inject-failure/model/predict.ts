import type { SnapshotResponse } from '@/shared/api';

export function snapshotWithoutSatellite(
  snapshot: SnapshotResponse | undefined,
  satelliteId: string,
): SnapshotResponse | undefined {
  if (!snapshot) return snapshot;

  return {
    ...snapshot,
    satellites: snapshot.satellites.map((satellite) =>
      satellite.id === satelliteId ? { ...satellite, active: false } : satellite,
    ),
    edges: snapshot.edges.filter(
      (edge) => edge.source !== satelliteId && edge.target !== satelliteId,
    ),
    routes: snapshot.routes.map((route) =>
      route.path.includes(satelliteId)
        ? { ...route, available: false, path: [], hops: null, distance_km: null, gateway_id: null }
        : route,
    ),
    active_satellites: Math.max(0, snapshot.active_satellites - 1),
  };
}

export function snapshotWithSatellite(
  snapshot: SnapshotResponse | undefined,
  satelliteId: string,
): SnapshotResponse | undefined {
  if (!snapshot) return snapshot;

  return {
    ...snapshot,
    satellites: snapshot.satellites.map((satellite) =>
      satellite.id === satelliteId ? { ...satellite, active: true } : satellite,
    ),
  };
}
