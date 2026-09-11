import { Satellite, GroundStation, Link, NetworkMetrics } from './types';

// TODO(BACKEND): Replace this entire fixture module with API queries. Values here
// are only for the interactive prototype and must not become a production source of truth.
const orbitPlanes = [
  { id: "P1", raan: 0, phase: 0, launchBatch: 1 },
  { id: "P2", raan: 60, phase: 7.5, launchBatch: 2 },
  { id: "P3", raan: 120, phase: 15, launchBatch: 3 },
] as const;

const normalizeLongitude = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** TODO(BACKEND): Read orbital elements and inclination from the constellation API. */
export const ORBIT_INCLINATION_DEG = 70;

/**
 * Ground track of a plane at orbit angle `angleDeg`. Satellites are seeded from
 * this curve, so drawing the same curve gives an orbit line that the satellites
 * of that plane actually sit on.
 */
export const orbitTrackPoint = (angleDeg: number) => ({
  lat: Math.sin((angleDeg * Math.PI) / 180) * ORBIT_INCLINATION_DEG,
  lon: angleDeg - 180,
});

// TODO(BACKEND): Fetch the ground-site catalog, roles and coordinates from the backend.
export const allGroundSites: GroundStation[] = [
  {
    id: 'G_MUR',
    name: 'Murmansk reference gateway',
    role: 'gateway',
    lat: 68.97,
    lon: 33.07,
  },
  {
    id: 'C65',
    name: 'Northern terminal 65',
    role: 'client',
    lat: 65.0,
    lon: 60.0,
  },
  {
    id: 'C70',
    name: 'Northern terminal 70',
    role: 'client',
    lat: 70.0,
    lon: 90.0,
  },
  {
    id: 'C72',
    name: 'Northern terminal 72',
    role: 'client',
    lat: 72.0,
    lon: 130.0,
  },
];

export const groundStations: GroundStation[] = allGroundSites.filter(site => site.role === 'client');
export const gateways: GroundStation[] = allGroundSites.filter(site => site.role === 'gateway');

// TODO(BACKEND): Fetch satellites, their current ephemeris, status and criticality.
// This deterministic constellation exists only to make the prototype navigable.
export const initialSatellites: Satellite[] = [];

orbitPlanes.forEach((plane, pIdx) => {
  for (let i = 0; i < 16; i++) {
    const satelliteNumber = pIdx * 16 + i + 1;
    const slotDeg = i * 22.5;
    const track = orbitTrackPoint(slotDeg + plane.phase);

    initialSatellites.push({
      id: `S${satelliteNumber.toString().padStart(2, '0')}`,
      plane: plane.id,
      lat: track.lat,
      lon: normalizeLongitude(track.lon),
      altitude: 550,
      status: "active",
      criticality: 20 + ((satelliteNumber * 7) % 45),
      launchBatch: plane.launchBatch,
      slotDeg,
    });
  }
});

// TODO(BACKEND): Criticality must be calculated by the backend, not assigned in the UI.
const critSatIds = ['S15', 'S16', 'S48', 'S32'];
critSatIds.forEach((id, idx) => {
  const sat = initialSatellites.find(s => s.id === id);
  if (sat) {
    sat.criticality = [94, 90, 86, 78][idx];
  }
});

// TODO(BACKEND): Replace generated ISL/ground links with a network-topology snapshot.
export const initialLinks: Link[] = [];
// Connect adjacent satellites in same plane
orbitPlanes.forEach(plane => {
  const planeSats = initialSatellites.filter(s => s.plane === plane.id);
  for (let i = 0; i < planeSats.length; i++) {
    initialLinks.push({
      source: planeSats[i].id,
      target: planeSats[(i + 1) % planeSats.length].id,
      type: "isl"
    });
  }
});

// Cross plane links
for (let i = 0; i < 16; i += 2) {
  initialLinks.push({
    source: `S${(i + 1).toString().padStart(2, '0')}`,
    target: `S${(i + 17).toString().padStart(2, '0')}`,
    type: "isl"
  });
  initialLinks.push({
    source: `S${(i + 17).toString().padStart(2, '0')}`,
    target: `S${(i + 33).toString().padStart(2, '0')}`,
    type: "isl"
  });
}

initialLinks.push(
  { source: 'C65', target: 'S20', type: 'ground' },
  { source: 'C70', target: 'S20', type: 'ground' },
  { source: 'C72', target: 'S35', type: 'ground' },
  { source: 'C65', target: 'S39', type: 'ground' },
  { source: 'C70', target: 'S09', type: 'ground' },
  { source: 'C72', target: 'S25', type: 'ground' },
  { source: 'S20', target: 'G_MUR', type: 'gateway' },
  { source: 'S35', target: 'S20', type: 'isl' },
  { source: 'S39', target: 'G_MUR', type: 'gateway' },
  { source: 'S09', target: 'G_MUR', type: 'gateway' },
  { source: 'S25', target: 'S09', type: 'isl' },
);

// TODO(BACKEND): Get the active route and its availability from the routing service.
export const activeRouteC65 = {
  groundStation: 'C65',
  path: ['C65', 'S39', 'G_MUR'],
  available: true,
};

// TODO(BACKEND): Return scenario metrics from simulation/monitoring endpoints.
export const baselineMetrics: NetworkMetrics = {
  availability: {
    C65: 96.7,
    C70: 98.8,
    C72: 98.9,
  },
  maxOutageMinutes: 8,
  criticalSatellites: 5,
};

export const failureMetrics: NetworkMetrics = {
  availability: {
    C65: 79.3,
    C70: 80.8,
    C72: 82.5,
  },
  maxOutageMinutes: 24,
  criticalSatellites: 5,
};

export const optimizedMetrics: NetworkMetrics = {
  availability: {
    C65: 98.1,
    C70: 99.2,
    C72: 99.3,
  },
  maxOutageMinutes: 14,
  criticalSatellites: 2,
};
