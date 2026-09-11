export type SatelliteStatus = "active" | "failed";
export type Plane = "P1" | "P2" | "P3";
export type GroundSiteRole = "client" | "gateway";

export type Satellite = {
  id: string;
  plane: Plane;
  lat: number;
  lon: number;
  altitude: number;
  status: SatelliteStatus;
  criticality: number;
  launchBatch?: 1 | 2 | 3;
  slotDeg?: number;
};

export type GroundStation = {
  id: string;
  name: string;
  role: GroundSiteRole;
  lat: number;
  lon: number;
};

export type LinkType = "isl" | "ground" | "gateway";

export type Link = {
  source: string;
  target: string;
  type: LinkType;
};

export type Route = {
  groundStation: string;
  available: boolean;
  path: string[];
};

export type NetworkMetrics = {
  availability: {
    C65: number;
    C70: number;
    C72: number;
  };
  maxOutageMinutes: number;
  criticalSatellites: number;
};

export type SimulationState = {
  time: number; // 0 to 24 * 60 (minutes)
  playing: boolean;
  speed: number;
  failedSatellites: string[];
  deploymentStage: 1 | 2 | 3;
  planes: {
    P1: { raan: number; phase: number };
    P2: { raan: number; phase: number };
    P3: { raan: number; phase: number };
  };
  gateways: string[];
};
