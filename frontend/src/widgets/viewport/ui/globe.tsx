'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import GlobeGL from 'react-globe.gl';
import * as THREE from 'three';
import type { LinkView, SatelliteView } from '@/entities/satellite';
import type { GroundSiteView } from '@/entities/ground-site';
import { routeEdgeIndex, edgeKey, type RouteTrace } from '@/entities/simulation';
import { criticalityLevel } from '@/shared/lib';
import { FALLBACK_CONTACT_RADIUS_KM } from '@/shared/config';
import {
  useFailurePings,
  FAILURE_RING_FLIGHT_MS,
  FAILURE_RING_INTERVAL_MS
} from '../model/use-failure-pings';

export type OrbitTrack = {
  planeId: string;
  color: string;
  points: { lat: number; lng: number }[];
};

/** Altitude (in globe radii) the constellation is drawn at. */
const SATELLITE_ALTITUDE = 0.05;
const EARTH_RADIUS_KM = 6371;
/** Short enough to feel instant, long enough to read as a reveal. */
const COVERAGE_TWEEN_MS = 220;
/** Long enough to see which way the globe turned, short enough not to wait. */
const FOCUS_FLIGHT_MS = 700;
const COVERAGE_CAP_OPACITY = 0.22;
const COVERAGE_SEGMENTS = 72;

/**
 * Brightest at the node, gone by the time the wave reaches the rim. The falloff
 * is held back at first: a WebGL line is one pixel wide whatever the zoom, so a
 * linear fade leaves most of the sweep too faint to read.
 */
const failureRingFade = (t: number) => `rgba(239,68,68,${(0.92 * (1 - t * t)).toFixed(3)})`;

type FailurePingDatum = { id: string; lat: number; lng: number };
const NO_FAILURE_PINGS: FailurePingDatum[] = [];

const toRadians = (degrees: number) => degrees * (Math.PI / 180);
const toDegrees = (radians: number) => radians * (180 / Math.PI);
const normalizeLongitude = (longitude: number) => ((longitude + 540) % 360) - 180;

/** Returns a closed geodesic ring around a satellite's current nadir point. */
const coverageRing = (lat: number, lng: number, radiusKm: number) => {
  const startLat = toRadians(lat);
  const startLng = toRadians(lng);
  const angularDistance = radiusKm / EARTH_RADIUS_KM;

  return Array.from({ length: COVERAGE_SEGMENTS + 1 }, (_, index) => {
    const bearing = (index / COVERAGE_SEGMENTS) * Math.PI * 2;
    const ringLat = Math.asin(
      Math.sin(startLat) * Math.cos(angularDistance)
      + Math.cos(startLat) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const ringLng = startLng + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLat),
      Math.cos(angularDistance) - Math.sin(startLat) * Math.sin(ringLat)
    );

    return { lat: toDegrees(ringLat), lng: normalizeLongitude(toDegrees(ringLng)) };
  });
};

export type GlobeCameraPosition = {
  lat: number;
  lng: number;
  altitude: number;
};

/** Camera defaults of globe.gl: 50° vertical FOV, globe radius in "altitude" units. */
const FOV_HALF_TAN = Math.tan((50 / 2) * (Math.PI / 180));
/** Design default — never zoom in closer than this on roomy screens. */
const BASE_ALTITUDE = 2.5;
/** Keep ~12% of padding around the globe when fitting it to a narrow container. */
const FIT_MARGIN = 1.12;

/**
 * Altitude at which the whole globe stays inside the container.
 * On narrow (portrait) containers the width is the limiting dimension, so the
 * camera has to pull back further than the desktop default.
 */
const fitAltitude = (width: number, height: number) => {
  if (!width || !height) return BASE_ALTITUDE;
  const limitingAspect = Math.min(1, width / height);
  return Math.max(BASE_ALTITUDE, FIT_MARGIN / (FOV_HALF_TAN * limitingAspect) - 1);
};

/** globe.gl builds the globe at radius 100, and places the camera at R*(1+altitude). */
const GLOBE_RADIUS = 100;
const altitudeToDistance = (altitude: number) => GLOBE_RADIUS * (1 + altitude);

/**
 * How far past the fitted framing the camera may pull back. Without a ceiling
 * OrbitControls lets the wheel run forever and the Earth ends up a speck among
 * the stars; 1.7x still shows every orbit track with room to spare.
 */
const MAX_ZOOM_OUT_FACTOR = 1.7;

/**
 * Closest approach. The globe is radius 1 in altitude units and the satellite
 * shell sits at 0.05, so anything below this puts the camera inside the Earth
 * and the view goes black.
 */
const MIN_ALTITUDE = 0.35;

const STAR_COUNT = 3200;
/** Globe radius is 100 scene units and the camera far plane sits at 4000. */
const STAR_SHELL_MIN = 700;
const STAR_SHELL_MAX = 1600;

/**
 * A starfield shell around the scene. Sitting in world space (rather than on
 * the camera) it parallaxes naturally as the globe auto-rotates, and the globe
 * mesh occludes the stars behind it.
 */
const createStarfield = () => {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);

  for (let i = 0; i < STAR_COUNT; i++) {
    // Evenly distributed directions: uniform z avoids clustering at the poles.
    const z = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const ringRadius = Math.sqrt(1 - z * z);
    const distance = STAR_SHELL_MIN + Math.random() * (STAR_SHELL_MAX - STAR_SHELL_MIN);

    positions[i * 3] = ringRadius * Math.cos(theta) * distance;
    positions[i * 3 + 1] = z * distance;
    positions[i * 3 + 2] = ringRadius * Math.sin(theta) * distance;

    // Mostly faint white, a few brighter ones with a cold or warm tint.
    const brightness = 0.35 + Math.random() ** 2.2 * 0.65;
    const tint = Math.random();
    colors[i * 3] = brightness * (tint > 0.85 ? 1 : 0.92);
    colors[i * 3 + 1] = brightness * 0.94;
    colors[i * 3 + 2] = brightness * (tint < 0.3 ? 1 : 0.9);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.7,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = -1;
  return points;
};

const SITE_LABEL_OFFSETS = [
  { x: 3, y: 20 },
  { x: 9, y: -14 },
  { x: 15, y: -30 },
  { x: -6, y: 26 }
];

interface GlobeProps {
  satellites: SatelliteView[];
  links: LinkView[];
  groundStations: GroundSiteView[];
  gateways: GroundSiteView[];
  routes?: RouteTrace[];
  onSiteClick?: (siteId: string) => void;
  focusClientId?: string | null;
  orbits?: OrbitTrack[];
  /** While the timeline runs, satellites render as small spheres instead of the
   *  default cylinder markers, which smear as they travel. */
  playing?: boolean;
  rotation?: [number, number, number];
  cameraPosition?: GlobeCameraPosition;
  onCameraPositionChange?: (position: GlobeCameraPosition) => void;
  onSatelliteClick?: (sat: SatelliteView) => void;
  selectedSatellite?: string | null;
  mode?: 'simulation' | 'resilience';
  /** A request to turn the globe to a satellite; the nonce re-fires a repeat pick. */
  focusOn?: { id: string; nonce: number } | null;
  /** Ground-contact radius derived from the scenario's elevation mask. */
  contactRadiusKm?: number;
}

export const Globe: React.FC<GlobeProps> = ({
  satellites,
  links,
  groundStations,
  gateways,
  routes = [],
  onSiteClick,
  focusClientId = null,
  orbits = [],
  playing = false,
  rotation = [0, -20, 0], // Kept for API compatibility, but react-globe handles its own view
  cameraPosition,
  onCameraPositionChange,
  onSatelliteClick,
  selectedSatellite,
  mode = 'simulation',
  focusOn = null,
  contactRadiusKm = FALLBACK_CONTACT_RADIUS_KM
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(undefined);
  const resumeRotationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedAltitudeRef = useRef<number | null>(null);
  const latestCameraPositionRef = useRef<GlobeCameraPosition | null>(null);
  const isUserInteractingRef = useRef(false);
  const hasSavedCameraPositionRef = useRef(Boolean(cameraPosition));
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const coverageCapMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: COVERAGE_CAP_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    []
  );

  useEffect(() => () => coverageCapMaterial.dispose(), [coverageCapMaterial]);

  // The footprint grows in and collapses out over a short eased tween. It is
  // driven here rather than through polygonsTransitionDuration so that it only
  // animates on select/deselect, never on the position updates that arrive
  // every frame while the timeline runs.
  const [coverageSatelliteId, setCoverageSatelliteId] = useState<string | null>(selectedSatellite ?? null);
  const [coverageScale, setCoverageScale] = useState(selectedSatellite ? 1 : 0);
  const coverageScaleRef = useRef(coverageScale);
  coverageScaleRef.current = coverageScale;
  const coverageSatelliteIdRef = useRef(coverageSatelliteId);
  coverageSatelliteIdRef.current = coverageSatelliteId;

  useEffect(() => {
    const target = selectedSatellite ? 1 : 0;
    // Moving the pick straight to another node has to restart the reveal. The
    // scale is still 1 from the previous selection, so without this the new
    // node jumps to full size and only the very first pick ever animates.
    const restarting = Boolean(selectedSatellite) && coverageSatelliteIdRef.current !== selectedSatellite;

    if (selectedSatellite) setCoverageSatelliteId(selectedSatellite);

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setCoverageScale(target);
      if (!selectedSatellite) setCoverageSatelliteId(null);
      return;
    }

    const from = restarting ? 0 : coverageScaleRef.current;
    if (from === target) return;
    if (restarting) setCoverageScale(0);

    const start = performance.now();
    let frame = 0;

    const step = (now: number) => {
      // rAF hands back the frame's own timestamp, which can predate the
      // start captured just before it — an unclamped progress goes negative
      // and the first frame renders a sub-zero radius.
      const t = Math.max(0, Math.min(1, (now - start) / COVERAGE_TWEEN_MS));
      const eased = 1 - Math.pow(1 - t, 3);
      setCoverageScale(from + (target - from) * eased);

      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else if (target === 0) {
        setCoverageSatelliteId(null);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [selectedSatellite]);

  useEffect(() => {
    coverageCapMaterial.opacity = COVERAGE_CAP_OPACITY * coverageScale;
  }, [coverageCapMaterial, coverageScale]);

  // One geometry for every satellite sphere; materials are cached per color and
  // meshes per satellite, so playback does not churn objects 10x a second.
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);
  const sphereMaterials = useRef(new Map<string, THREE.MeshBasicMaterial>());
  const satelliteGroups = useRef(new Map<string, THREE.Group>());
  const lastClickRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });

  /**
   * A satellite dot is about 1% of the globe radius — roughly three pixels at
   * the default framing, which is near impossible to click. An invisible sphere
   * around it widens the hit area without touching the picture. Doing this in
   * the scene rather than with an HTML overlay matters: globe.gl raycasts on
   * click only, so dragging the globe still works over every satellite.
   */
  const HIT_RADIUS_SCALE = 4.5;
  const hitMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    []
  );

  useEffect(() => {
    const materials = sphereMaterials.current;
    const groups = satelliteGroups.current;

    return () => {
      materials.forEach(material => material.dispose());
      materials.clear();
      groups.clear();
      hitMaterial.dispose();
      sphereGeometry.dispose();
    };
  }, [sphereGeometry, hitMaterial]);

  const satelliteSphere = (d: any) => {
    let material = sphereMaterials.current.get(d.color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: d.color });
      sphereMaterials.current.set(d.color, material);
    }

    let group = satelliteGroups.current.get(d.id);
    if (!group) {
      group = new THREE.Group();
      const dot = new THREE.Mesh(sphereGeometry, material);
      dot.name = 'dot';
      const hit = new THREE.Mesh(sphereGeometry, hitMaterial);
      hit.name = 'hit';
      group.add(dot, hit);
      satelliteGroups.current.set(d.id, group);
    }

    const dot = group.getObjectByName('dot') as THREE.Mesh;
    const hit = group.getObjectByName('hit') as THREE.Mesh;

    dot.material = material;
    dot.scale.setScalar(d.sphereRadius);
    // While paused the points layer draws the marker, so the group is then a
    // hit target only.
    dot.visible = d.sphereVisible;
    hit.scale.setScalar(d.sphereRadius * HIT_RADIUS_SCALE);

    return group;
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Update globe POV on mount
  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.pointOfView(cameraPosition ?? { lat: 0, lng: 0, altitude: BASE_ALTITUDE });
      globeRef.current.controls().autoRotate = true;
      globeRef.current.controls().autoRotateSpeed = 0.5;
      globeRef.current.controls().enableZoom = true;
    }
  }, []);

  const focusNonceRef = useRef<number | null>(null);
  const satellitesRef = useRef(satellites);
  satellitesRef.current = satellites;

  useEffect(() => {
    if (!focusOn || focusOn.nonce === focusNonceRef.current) return;
    focusNonceRef.current = focusOn.nonce;

    const globe = globeRef.current;
    if (!globe) return;

    const satellite = satellitesRef.current.find(sat => sat.id === focusOn.id);
    if (!satellite) return;

    // Altitude is carried over untouched: the pick says which node to look at,
    // not how close to get. Auto-rotation has to stop, or the node drifts back
    // out of frame the moment it arrives.
    const controls = globe.controls?.();
    if (controls) controls.autoRotate = false;

    globe.pointOfView(
      { lat: satellite.lat, lng: satellite.lon, altitude: globe.pointOfView().altitude },
      FOCUS_FLIGHT_MS
    );
  }, [focusOn]);

  // Stars behind the Earth.
  useEffect(() => {
    const scene = globeRef.current?.scene?.();
    if (!scene) return;

    const stars = createStarfield();
    scene.add(stars);

    return () => {
      scene.remove(stars);
      stars.geometry.dispose();
      (stars.material as THREE.PointsMaterial).dispose();
    };
  }, []);

  // Keep the whole globe inside the viewport as the container resizes.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !dimensions.width || !dimensions.height) return;

    // A saved user view takes precedence over responsive default framing.
    if (hasSavedCameraPositionRef.current) return;

    const target = fitAltitude(dimensions.width, dimensions.height);
    const current = globe.pointOfView().altitude;

    // Never fight a zoom level the user picked themselves.
    if (appliedAltitudeRef.current !== null && Math.abs(current - appliedAltitudeRef.current) > 0.05) return;
    if (Math.abs(current - target) < 0.01) {
      appliedAltitudeRef.current = target;
      return;
    }

    globe.pointOfView({ altitude: target });
    appliedAltitudeRef.current = target;
  }, [dimensions.width, dimensions.height]);

  // Cap how far the wheel can pull the camera back. The ceiling follows the
  // fitted framing, so a narrow container — which already starts further out —
  // keeps the same amount of usable travel as a wide one.
  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (!controls || !dimensions.width || !dimensions.height) return;

    controls.minDistance = altitudeToDistance(MIN_ALTITUDE);
    controls.maxDistance =
      altitudeToDistance(fitAltitude(dimensions.width, dimensions.height)) * MAX_ZOOM_OUT_FACTOR;
  }, [dimensions.width, dimensions.height]);

  useEffect(() => {
    return () => {
      if (resumeRotationTimeoutRef.current) {
        clearTimeout(resumeRotationTimeoutRef.current);
      }
      if (cameraPersistTimeoutRef.current) {
        clearTimeout(cameraPersistTimeoutRef.current);
      }
      if (interactionEndTimeoutRef.current) {
        clearTimeout(interactionEndTimeoutRef.current);
      }
    };
  }, []);

  const publishCameraPosition = () => {
    const position = latestCameraPositionRef.current;
    if (position) onCameraPositionChange?.(position);
  };

  const captureCurrentCameraPosition = () => {
    const position = globeRef.current?.pointOfView?.();
    if (!position) return;

    latestCameraPositionRef.current = {
      lat: position.lat,
      lng: position.lng,
      altitude: position.altitude
    };
  };

  const queueCameraPersistence = () => {
    if (cameraPersistTimeoutRef.current) {
      clearTimeout(cameraPersistTimeoutRef.current);
    }

    cameraPersistTimeoutRef.current = setTimeout(publishCameraPosition, 180);
  };

  const pauseRotationAfterUserContact = () => {
    const controls = globeRef.current?.controls?.();
    if (!controls) return;

    isUserInteractingRef.current = true;
    controls.autoRotate = false;

    if (resumeRotationTimeoutRef.current) {
      clearTimeout(resumeRotationTimeoutRef.current);
    }

    resumeRotationTimeoutRef.current = setTimeout(() => {
      const latestControls = globeRef.current?.controls?.();
      if (latestControls) {
        latestControls.autoRotate = true;
      }
    }, 50000);

    // Wheel zoom resolves just after the browser's event; read the settled POV.
    finishUserInteraction();
  };

  const finishUserInteraction = () => {
    if (interactionEndTimeoutRef.current) {
      clearTimeout(interactionEndTimeoutRef.current);
    }

    interactionEndTimeoutRef.current = setTimeout(() => {
      captureCurrentCameraPosition();
      isUserInteractingRef.current = false;
      publishCameraPosition();
    }, 180);
  };

  const handleZoom = (position: GlobeCameraPosition) => {
    if (!isUserInteractingRef.current) return;

    latestCameraPositionRef.current = position;
    queueCameraPersistence();
  };

  // Prepare satellite data
  const routeEdges = useMemo(() => routeEdgeIndex(routes), [routes]);

  const routeNodes = useMemo(() => {
    const carried = new Map<string, string>();
    for (const trace of routes) {
      if (!trace.available) continue;
      for (const node of trace.path) {
        if (trace.focused || !carried.has(node)) carried.set(node, trace.color);
      }
    }
    return carried;
  }, [routes]);

  const pointsData = useMemo(() => {
    return satellites.map(sat => {
      const isSelected = selectedSatellite === sat.id;
      const isFailed = sat.failed;
      const routeColour = routeNodes.get(sat.id);
      
      let color = "#a1a1aa"; // zinc-400
      let altitude = 0.05;
      
      if (isFailed) {
        color = "#ef4444"; // red-500
      } else if (mode === 'resilience') {
        color = criticalityLevel(sat.criticality).color;
      } else if (routeColour) {
        color = routeColour;
      } else if (mode === 'simulation') {
        color = sat.color;
      }

      // Selection is shown by size, the emphasized ID chip, the coverage
      // footprint and the highlighted orbit — never by recoloring the node,
      // which would hide which plane it belongs to.
      const emphasized = isFailed || isSelected;

      // The growth rides the same tween as the coverage footprint, and only the
      // picked node reads it — a layer-wide transition would animate all 48.
      const grow = sat.id === coverageSatelliteId ? coverageScale : 0;

      return {
        ...sat,
        color,
        globeAltitude: altitude,
        radius: isFailed ? 0.8 : 0.4 + 0.4 * grow,
        sphereRadius: isFailed ? 1.5 : 0.95 + 0.55 * grow,
        sphereVisible: playing,
        emphasized
      };
    });
  }, [satellites, selectedSatellite, routeNodes, mode, playing, coverageSatelliteId, coverageScale]);

  // Same footprint the coverage cap draws, in the degrees of arc the ring
  // layer measures in — recomputed per scenario since contactRadiusKm is.
  const coverageDegrees = (contactRadiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  // Deg/s rather than a duration is what the ring layer takes, so the flight
  // time to the node's own footprint is converted here.
  const failureRingSpeedDegS = coverageDegrees / (FAILURE_RING_FLIGHT_MS / 1000);

  // Rings keep their datum identity for the whole burst: the layer animates the
  // waves itself, and a replaced datum would tear the ones in flight down. Only
  // the position is written through, so a burst travels with its node.
  const failurePings = useFailurePings(satellites);
  const failurePingStore = useRef(new Map<string, FailurePingDatum>());

  const failurePingData = useMemo(() => {
    if (!failurePings.size) {
      failurePingStore.current.clear();
      return NO_FAILURE_PINGS;
    }

    const store = failurePingStore.current;
    store.forEach((_, id) => {
      if (!failurePings.has(id)) store.delete(id);
    });

    return [...failurePings]
      .map(id => {
        const sat = satellites.find(s => s.id === id);
        if (!sat) return null;

        const datum = store.get(id) ?? { id, lat: sat.lat, lng: sat.lon };
        datum.lat = sat.lat;
        datum.lng = sat.lon;
        store.set(id, datum);
        return datum;
      })
      .filter((datum): datum is FailurePingDatum => datum !== null);
  }, [failurePings, satellites]);

  const highlightedPlane = useMemo(
    () => satellites.find(s => s.id === selectedSatellite)?.planeId ?? null,
    [satellites, selectedSatellite]
  );


  const selectedCoverage = useMemo(() => {
    const satellite = satellites.find(sat => sat.id === coverageSatelliteId);
    if (!satellite || coverageScale <= 0.001) return null;

    const boundary = coverageRing(satellite.lat, satellite.lon, contactRadiusKm * coverageScale);

    return {
      geometry: {
        type: 'Polygon',
        coordinates: [boundary.map(point => [point.lng, point.lat])]
      },
      borderPoints: boundary.map(point => [point.lat, point.lng, 0.008] as [number, number, number]),
      borderOpacity: coverageScale
    };
  }, [satellites, coverageSatelliteId, coverageScale]);

  // Prepare links data
  const arcsData = useMemo(() => {
    return links.map(link => {
      const sourceNode = satellites.find(s => s.id === link.source) || groundStations.find(g => g.id === link.source) || gateways.find(g => g.id === link.source);
      const targetNode = satellites.find(s => s.id === link.target) || groundStations.find(g => g.id === link.target) || gateways.find(g => g.id === link.target);
      
      if (!sourceNode || !targetNode) return null;

      const routeEdge = routeEdges.get(edgeKey(link.source, link.target));
      const isRoute = Boolean(routeEdge);
      const isFailed = Boolean((sourceNode as SatelliteView).failed) || Boolean((targetNode as SatelliteView).failed);

      if (isFailed && isRoute) return null;

      const sourcePlane = (sourceNode as SatelliteView).planeId;
      const targetPlane = (targetNode as SatelliteView).planeId;
      const samePlane = Boolean(sourcePlane) && sourcePlane === targetPlane;
      const inHighlightedPlane = highlightedPlane !== null && samePlane && sourcePlane === highlightedPlane;

      // Baseline links used to be near-invisible; each class now has its own
      // weight so inter-satellite links read at a glance without becoming a web.
      // Links inside one plane take that plane's hue, which ties the group to
      // its orbit line; cross-plane hops stay neutral cyan.
      let color = 'rgba(125,211,252,0.5)'; // cross-plane ISL
      let stroke = 0.26;

      if (routeEdge) {
        color = routeEdge.focused ? routeEdge.color : `${routeEdge.color}b3`;
        stroke = routeEdge.focused ? 0.62 : 0.42;
      } else if (isFailed) {
        color = 'rgba(239,68,68,0.45)';
        stroke = 0.2;
      } else if (link.kind === 'gateway') {
        color = 'rgba(251,191,36,0.45)';
        stroke = 0.24;
      } else if (link.kind === 'ground') {
        color = 'rgba(125,211,252,0.3)';
        stroke = 0.16;
      } else if (samePlane) {
        color = `${(sourceNode as SatelliteView).color}${inHighlightedPlane ? 'cc' : '73'}`;
        stroke = inHighlightedPlane ? 0.3 : 0.22;
      }

      const sourceIsSat = 'plane' in sourceNode;
      const targetIsSat = 'plane' in targetNode;

      return {
        startLat: sourceNode.lat,
        startLng: sourceNode.lon,
        startAlt: sourceIsSat ? SATELLITE_ALTITUDE : 0,
        endLat: targetNode.lat,
        endLng: targetNode.lon,
        endAlt: targetIsSat ? SATELLITE_ALTITUDE : 0,
        color: [color, color],
        dashAnimateTime: routeEdge ? (routeEdge.focused ? 1000 : 2600) : 0,
        dashLength: routeEdge ? 0.5 : 1,
        dashGap: routeEdge ? 0.2 : 0,
        stroke
      };
    }).filter((arc): arc is NonNullable<typeof arc> => arc !== null);
  }, [links, satellites, groundStations, gateways, routeEdges, highlightedPlane]);

  /**
   * One closed line per orbital plane. The plane of the selected satellite is
   * lifted out of the background so its whole group reads as a unit.
   */
  const pathsData = useMemo(() => {
    const orbitPaths = orbits.map(orbit => {
      const isHighlighted = orbit.planeId === highlightedPlane;
      const base = orbit.color;

      return {
        points: orbit.points.map(p => [p.lat, p.lng, SATELLITE_ALTITUDE] as [number, number, number]),
        color: isHighlighted ? base : `${base}e6`,
        stroke: isHighlighted ? 0.55 : 0.42,
        // Dashes are what separate an orbit track from the solid link arcs that
        // run along the same path.
        dashLength: 0.016,
        dashGap: 0.01,
        dashAnimateTime: 0
      };
    });

    if (!selectedCoverage) return orbitPaths;

    return [
      ...orbitPaths,
      {
        points: selectedCoverage.borderPoints,
        color: `rgba(186,230,253,${(0.9 * selectedCoverage.borderOpacity).toFixed(3)})`,
        stroke: 0.34,
        dashLength: 0.05,
        dashGap: 0.035,
        dashAnimateTime: 0
      }
    ];
  }, [orbits, highlightedPlane, selectedCoverage]);

  // Ground sites are deliberately rendered above the satellite layer so their
  // operational labels remain legible against the Earth and the starfield.
  const htmlElementsData = useMemo(() => {
    const data: any[] = [];

    satellites.forEach(sat => {
      data.push({
        lat: sat.lat,
        lng: sat.lon,
        alt: SATELLITE_ALTITUDE,
        type: 'sat',
        id: sat.id,
        sat,
        accent: sat.failed ? '#e4483a' : sat.color,
        emphasized: sat.failed || sat.id === selectedSatellite || routeNodes.has(sat.id)
      });
    });

    groundStations.forEach((gs, index) => {
      const trace = routes.find(item => item.clientId === gs.id);
      data.push({
        lat: gs.lat,
        lng: gs.lon,
        alt: 0,
        type: 'gs',
        id: gs.id,
        name: gs.name,
        focused: gs.id === focusClientId,
        routeColor: trace?.available ? trace.color : null,
        offline: trace ? !trace.available : false,
        labelOffset: SITE_LABEL_OFFSETS[index % SITE_LABEL_OFFSETS.length]
      });
    });
    gateways.forEach(gw => {
      data.push({
        lat: gw.lat,
        lng: gw.lon,
        alt: 0,
        type: 'gw',
        id: gw.id,
        name: gw.name,
        labelOffset: { x: 0, y: 21 }
      });
    });
    return data;
  }, [satellites, groundStations, gateways, selectedSatellite, routeNodes, routes, focusClientId]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      onPointerDown={pauseRotationAfterUserContact}
      onPointerMove={pauseRotationAfterUserContact}
      onPointerUp={finishUserInteraction}
      onPointerCancel={finishUserInteraction}
      onPointerLeave={finishUserInteraction}
      onWheel={pauseRotationAfterUserContact}
      onTouchStart={pauseRotationAfterUserContact}
      onTouchEnd={finishUserInteraction}
    >
      <GlobeGL
        ref={globeRef}
        width={dimensions.width || 1}
        height={dimensions.height || 1}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundColor="rgba(0,0,0,0)"
        onZoom={handleZoom}
        
        pointsData={playing ? [] : pointsData}
        pointLat="lat"
        pointLng="lon"
        pointColor="color"
        pointAltitude="globeAltitude"
        pointRadius="radius"
        pointResolution={32}
        pointsTransitionDuration={0}
        onPointClick={(pt: any) => onPointClick(pt)}
        pointLabel={satelliteTooltip}

        objectsData={pointsData}
        objectLat="lat"
        objectLng="lon"
        objectAltitude="globeAltitude"
        objectThreeObject={satelliteSphere}
        objectLabel={satelliteTooltip}
        onObjectClick={(obj: any) => onPointClick(obj)}

        arcsData={arcsData}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcStartAltitude="startAlt"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcEndAltitude="endAlt"
        arcColor="color"
        arcDashLength="dashLength"
        arcDashGap="dashGap"
        arcDashAnimateTime="dashAnimateTime"
        arcStroke="stroke"
        arcAltitudeAutoScale={0.2}
        arcsTransitionDuration={0}

        polygonsData={selectedCoverage ? [selectedCoverage] : []}
        polygonGeoJsonGeometry="geometry"
        polygonCapMaterial={coverageCapMaterial}
        polygonSideColor="rgba(148,163,184,0)"
        polygonStrokeColor={null}
        polygonAltitude={0.006}
        polygonCapCurvatureResolution={1}
        polygonsTransitionDuration={0}

        ringsData={failurePingData}
        ringLat="lat"
        ringLng="lng"
        ringAltitude={0.01}
        ringColor={() => failureRingFade}
        ringMaxRadius={coverageDegrees}
        ringPropagationSpeed={failureRingSpeedDegS}
        ringRepeatPeriod={FAILURE_RING_INTERVAL_MS}
        ringResolution={96}

        pathsData={pathsData}
        pathPoints="points"
        pathPointLat={(p: any) => p[0]}
        pathPointLng={(p: any) => p[1]}
        pathPointAlt={(p: any) => p[2]}
        pathColor="color"
        pathStroke="stroke"
        pathDashLength="dashLength"
        pathDashGap="dashGap"
        pathDashAnimateTime="dashAnimateTime"
        pathResolution={2}
        pathTransitionDuration={0}

        htmlElementsData={htmlElementsData}
        htmlAltitude={(d: any) => d.alt ?? 0}
        htmlTransitionDuration={0}
        htmlElement={(d: any) => {
          const el = document.createElement('div');

          // Satellites: a small ID plate next to the dot drawn by the points
          // layer. Kept secondary so 48 of them never turn into noise.
          if (d.type === 'sat') {
            el.style.cssText = 'pointer-events:none;white-space:nowrap;font-family:\'IBM Plex Mono\', ui-monospace, SFMono-Regular, Menlo, monospace';

            const idleBorder = d.emphasized ? d.accent : 'rgba(63,63,70,0.9)';
            const chip = document.createElement('div');
            chip.textContent = d.id;
            chip.style.cssText = [
              'transform:translate(9px,-50%)',
              'padding:2px 5px',
              'border-radius:3px',
              `border:1px solid ${idleBorder}`,
              'background:rgba(3,7,18,0.82)',
              `color:${d.emphasized ? d.accent : '#a1a1aa'}`,
              'font-size:9px',
              'line-height:11px',
              'letter-spacing:0.04em',
              `font-weight:${d.emphasized ? 700 : 500}`,
              'pointer-events:auto',
              'cursor:pointer',
              d.emphasized ? `box-shadow:0 0 10px ${d.accent}55` : 'box-shadow:0 2px 6px rgba(0,0,0,0.5)'
            ].join(';');

            chip.addEventListener('pointerenter', () => {
              chip.style.borderColor = '#e4e4e7';
              chip.style.color = '#fafafa';
            });
            chip.addEventListener('pointerleave', () => {
              chip.style.borderColor = idleBorder;
              chip.style.color = d.emphasized ? d.accent : '#a1a1aa';
            });

            // Only a tap counts. A drag that happens to start on a plate should
            // not select anything.
            let downAt: { x: number; y: number } | null = null;
            chip.addEventListener('pointerdown', event => {
              downAt = { x: event.clientX, y: event.clientY };
            });
            chip.addEventListener('click', event => {
              if (!downAt) return;
              const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
              downAt = null;
              if (moved > 4) return;
              onPointClick(d.sat);
            });

            el.appendChild(chip);
            return el;
          }

          const isGateway = d.type === 'gw';
          const accent = isGateway
            ? '#fbbf24'
            : d.offline
              ? '#e4483a'
              : (d.routeColor ?? '#60a5fa');
          const accentDim = `${accent}38`;
          // Sites cluster around the served region, so labels are fanned out by
          // index rather than pinned to ids the jury's file will not contain.
          const labelOffset = d.labelOffset ?? { x: 0, y: 0 };

          el.style.cssText = [
            `pointer-events:${isGateway ? 'none' : 'auto'}`,
            'white-space:nowrap',
            'font-family:ui-monospace, SFMono-Regular, Menlo, monospace'
          ].join(';');

          // CSS2DRenderer owns the outer element's transform. The site itself
          // uses a zero-size anchor, so marker and label stay rigidly grouped.
          const content = document.createElement('div');
          content.style.cssText = 'position:relative;width:0;height:0;overflow:visible;';

          const marker = document.createElement('div');
          marker.style.cssText = isGateway
            ? `position:absolute;left:-7px;top:-7px;box-sizing:border-box;width:14px;height:14px;background:${accent};transform:rotate(45deg);border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 0 4px ${accentDim},0 0 18px ${accent};`
            : `position:absolute;left:-8px;top:-8px;box-sizing:border-box;width:16px;height:16px;border-radius:50%;border:2px solid ${accent};background:#08111f;box-shadow:0 0 0 4px ${accentDim},0 0 18px ${accent};`;

          if (!isGateway) {
            const core = document.createElement('div');
            core.style.cssText = `position:absolute;inset:3px;border-radius:50%;background:${accent};`;
            marker.appendChild(core);
          }

          const label = document.createElement('div');
          const labelBorder = isGateway ? 'rgba(251,191,36,0.75)' : `${accent}c7`;
          label.style.cssText = `position:absolute;left:${10 + labelOffset.x}px;top:${-11 + labelOffset.y}px;display:flex;flex-direction:column;gap:0;padding:2px 5px;border:1px solid ${d.focused ? '#fafafa' : labelBorder};border-radius:3px;background:rgba(3,7,18,0.9);box-shadow:${d.focused ? `0 0 12px ${accentDim},` : ''}0 3px 10px rgba(0,0,0,0.42);`;

          if (!isGateway && onSiteClick) {
            label.style.cursor = 'pointer';
            marker.style.cursor = 'pointer';

            let downAt: { x: number; y: number } | null = null;
            const arm = (event: PointerEvent) => {
              downAt = { x: event.clientX, y: event.clientY };
            };
            const fire = (event: MouseEvent) => {
              if (!downAt) return;
              const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
              downAt = null;
              if (moved > 4) return;
              onSiteClick(d.id);
            };

            for (const target of [label, marker]) {
              target.addEventListener('pointerdown', arm);
              target.addEventListener('click', fire);
            }
          }

          const code = document.createElement('span');
          code.textContent = d.id;
          code.style.cssText = `color:${accent};font-size:10px;font-weight:700;line-height:12px;letter-spacing:0.04em;text-shadow:0 0 8px ${accentDim};`;

          const name = document.createElement('span');
          name.textContent = d.name;
          name.style.cssText = 'max-width:112px;overflow:hidden;text-overflow:ellipsis;color:#d4d4d8;font-size:8px;line-height:10px;letter-spacing:0.02em;';

          label.append(code, name);
          content.append(marker, label);
          el.appendChild(content);
          return el;
        }}
      />
    </div>
  );

  function satelliteTooltip(sat: any) {
    return `
      <div style="background:#000;padding:4px 8px;border:1px solid #2e2e34;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;color:#e4e4e7;">
        ${sat.id}<br/>
        <span style="color:#71717a">Alt ${sat.altitudeKm.toFixed(0)} km</span>
      </div>
    `;
  }

  function onPointClick(pt: any) {
    if (!pt || !onSatelliteClick) return;

    // One click can be reported by up to three paths: the ID plate, the points
    // layer and the objects layer. Selection toggles, so a duplicate would undo
    // the selection the user just made.
    const now = Date.now();
    if (lastClickRef.current.id === pt.id && now - lastClickRef.current.at < 300) return;
    lastClickRef.current = { id: pt.id, at: now };

    onSatelliteClick(pt as SatelliteView);
  }
};
