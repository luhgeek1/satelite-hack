'use client';

import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import GlobeGL from 'react-globe.gl';
import { flushSync } from 'react-dom';
import * as THREE from 'three';
import type { LinkView, SatelliteView } from '@/entities/satellite';
import type { GroundSiteView } from '@/entities/ground-site';
import { routeEdgeIndex, edgeKey, type RouteTrace } from '@/entities/simulation';
import { criticalityLevel } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { FALLBACK_CONTACT_RADIUS_KM } from '@/shared/config';
import type { CoverageGap } from '../model/coverage-gaps';
import {
  useFailurePings,
  FAILURE_RING_FLIGHT_MS,
  FAILURE_RING_INTERVAL_MS
} from '../model/use-failure-pings';
import { useKonamiCode } from '../model/use-konami-code';
import { PlanetExplosionController, type ExplosionPhase, type ExplosionMode } from '../model/globe-explosion';

export type OrbitTrack = {
  planeId: string;

  pending?: boolean;
  color: string;
  points: { lat: number; lng: number }[];
};


const SATELLITE_ALTITUDE = 0.05;
const EARTH_RADIUS_KM = 6371;

const COVERAGE_TWEEN_MS = 220;

const FOCUS_FLIGHT_MS = 700;













const MIN_TRAIL_MS = 90;
const MAX_TRAIL_MS = 500;










const TRAIL_SHARE = 0.85;

const GAP_BLEND = 0.2;








const SMOOTH_MS = 45;









const SEGMENT_OVERRUN = 1.35;










const TELEPORT_RATIO = 4;
const TELEPORT_DISTANCE = 80;

const PLATE_SWEEP_MS = 400;

const RESIZE_SETTLE_MS = 180;
const COVERAGE_CAP_OPACITY = 0.22;
const COVERAGE_SEGMENTS = 72;






const failureRingFade = (t: number) => `rgba(239,68,68,${(0.92 * (1 - t * t)).toFixed(3)})`;

type FailurePingDatum = { id: string; lat: number; lng: number };
const NO_FAILURE_PINGS: FailurePingDatum[] = [];
const NO_COVERAGE_GAPS: CoverageGap[] = [];






const GAP_CAP_CURVATURE = 4;

const toRadians = (degrees: number) => degrees * (Math.PI / 180);
const toDegrees = (radians: number) => radians * (180 / Math.PI);
const normalizeLongitude = (longitude: number) => ((longitude + 540) % 360) - 180;


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


const FOV_HALF_TAN = Math.tan((50 / 2) * (Math.PI / 180));

const BASE_ALTITUDE = 2.5;

const FIT_MARGIN = 1.12;






const fitAltitude = (width: number, height: number) => {
  if (!width || !height) return BASE_ALTITUDE;
  const limitingAspect = Math.min(1, width / height);
  return Math.max(BASE_ALTITUDE, FIT_MARGIN / (FOV_HALF_TAN * limitingAspect) - 1);
};


const GLOBE_RADIUS = 100;
const altitudeToDistance = (altitude: number) => GLOBE_RADIUS * (1 + altitude);






const MAX_ZOOM_OUT_FACTOR = 1.7;






const MIN_ALTITUDE = 0.35;

const STAR_COUNT = 3200;

const STAR_SHELL_MIN = 700;
const STAR_SHELL_MAX = 1600;






const createStarfield = () => {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);

  for (let i = 0; i < STAR_COUNT; i++) {

    const z = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const ringRadius = Math.sqrt(1 - z * z);
    const distance = STAR_SHELL_MIN + Math.random() * (STAR_SHELL_MAX - STAR_SHELL_MIN);

    positions[i * 3] = ringRadius * Math.cos(theta) * distance;
    positions[i * 3 + 1] = z * distance;
    positions[i * 3 + 2] = ringRadius * Math.sin(theta) * distance;


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


  playing?: boolean;
  rotation?: [number, number, number];
  cameraPosition?: GlobeCameraPosition;
  onCameraPositionChange?: (position: GlobeCameraPosition) => void;
  onSatelliteClick?: (sat: SatelliteView) => void;
  selectedSatellite?: string | null;
  mode?: 'simulation' | 'resilience';

  focusOn?: { id: string; nonce: number } | null;

  contactRadiusKm?: number;

  coverageGaps?: CoverageGap[];
  resetNonce?: number;
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
  rotation = [0, -20, 0],
  cameraPosition,
  onCameraPositionChange,
  onSatelliteClick,
  selectedSatellite,
  mode = 'simulation',
  focusOn = null,
  contactRadiusKm = FALLBACK_CONTACT_RADIUS_KM,
  coverageGaps = NO_COVERAGE_GAPS,
  resetNonce = 0
}) => {
  const { t } = useI18n();
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
  const [isGlobeVisible, setIsGlobeVisible] = useState(true);
  const [explosionPhase, setExplosionPhase] = useState<ExplosionPhase>('idle');
  const [explosionMode, setExplosionMode] = useState<ExplosionMode>('konami');
  const explosionControllerRef = useRef<PlanetExplosionController | null>(null);
  const coverageCapMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: COVERAGE_CAP_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    []
  );

  useEffect(() => () => coverageCapMaterial.dispose(), [coverageCapMaterial]);




  const gapCapMaterials = useRef(new Map<string, THREE.MeshBasicMaterial>());
  const gapOpacityRef = useRef(0);

  const gapCapMaterial = (color: string) => {
    const cache = gapCapMaterials.current;
    let material = cache.get(color);

    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: gapOpacityRef.current,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      cache.set(color, material);
    }




    material.opacity = gapOpacityRef.current;

    return material;
  };





  useEffect(() => {
    const cache = gapCapMaterials.current;
    return () => {
      cache.forEach(material => material.dispose());
    };
  }, []);







  const [coverageSatelliteId, setCoverageSatelliteId] = useState<string | null>(selectedSatellite ?? null);
  const coverageOpacityRef = useRef(selectedSatellite ? COVERAGE_CAP_OPACITY : 0);

  useEffect(() => {
    if (selectedSatellite) setCoverageSatelliteId(selectedSatellite);

    const target = selectedSatellite ? COVERAGE_CAP_OPACITY : 0;
    const apply = (value: number) => {
      coverageOpacityRef.current = value;
      coverageCapMaterial.opacity = value;
    };

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      apply(target);
      if (!selectedSatellite) setCoverageSatelliteId(null);
      return;
    }



    const from = selectedSatellite ? 0 : coverageOpacityRef.current;
    apply(from);

    const start = performance.now();
    let frame = 0;

    const step = (now: number) => {


      const t = Math.max(0, Math.min(1, (now - start) / COVERAGE_TWEEN_MS));
      apply(from + (target - from) * (1 - Math.pow(1 - t, 3)));

      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else if (target === 0) {


        setCoverageSatelliteId(null);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [selectedSatellite, coverageCapMaterial]);

  const gapFocus = coverageGaps.length ? focusClientId : null;

  useEffect(() => {
    const apply = (value: number) => {
      gapOpacityRef.current = value;
      gapCapMaterials.current.forEach(material => {
        material.opacity = value;
      });
    };

    if (!gapFocus) {
      apply(0);
      return;
    }

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      apply(COVERAGE_CAP_OPACITY);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / COVERAGE_TWEEN_MS));
      apply(COVERAGE_CAP_OPACITY * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [gapFocus]);



  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);
  const sphereMaterials = useRef(new Map<string, THREE.MeshBasicMaterial>());
  const satelliteGroups = useRef(new Map<string, THREE.Group>());
  const lastClickRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const satelliteClickRef = useRef(onSatelliteClick);
  const siteClickRef = useRef(onSiteClick);
  satelliteClickRef.current = onSatelliteClick;
  siteClickRef.current = onSiteClick;

  const onPointClick = useCallback((pt: SatelliteView | null) => {
    if (!pt || !satelliteClickRef.current) return;


    const now = Date.now();
    if (lastClickRef.current.id === pt.id && now - lastClickRef.current.at < 300) return;
    lastClickRef.current = { id: pt.id, at: now };

    satelliteClickRef.current(pt);
  }, []);








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

  const dressSatellite = useCallback((group: THREE.Group, d: any) => {
    let material = sphereMaterials.current.get(d.color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: d.color });
      sphereMaterials.current.set(d.color, material);
    }

    const dot = group.getObjectByName('dot') as THREE.Mesh;
    const hit = group.getObjectByName('hit') as THREE.Mesh;

    dot.material = material;
    dot.scale.setScalar(d.sphereRadius);


    dot.visible = d.sphereVisible;
    hit.scale.setScalar(d.sphereRadius * HIT_RADIUS_SCALE);
  }, [hitMaterial]);








  const satelliteSphere = useCallback((d: any) => {
    let group = satelliteGroups.current.get(d.id);

    if (!group) {
      group = new THREE.Group();
      const dot = new THREE.Mesh(sphereGeometry, sphereMaterials.current.get(d.color) ?? hitMaterial);
      dot.name = 'dot';
      const hit = new THREE.Mesh(sphereGeometry, hitMaterial);
      hit.name = 'hit';
      group.add(dot, hit);
      satelliteGroups.current.set(d.id, group);
    }

    dressSatellite(group, d);
    return group;
  }, [dressSatellite, sphereGeometry, hitMaterial]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;




      flushSync(() => setDimensions({ width: Math.round(width), height: Math.round(height) }));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);


  useEffect(() => {
    if (globeRef.current) {





      const renderer = globeRef.current.renderer?.();
      if (renderer?.debug) renderer.debug.checkShaderErrors = false;

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




    const controls = globe.controls?.();
    if (controls) controls.autoRotate = false;

    globe.pointOfView(
      { lat: satellite.lat, lng: satellite.lon, altitude: globe.pointOfView().altitude },
      FOCUS_FLIGHT_MS
    );
  }, [focusOn]);


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


  useEffect(() => {
    let controller: PlanetExplosionController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const init = () => {
      const scene = globeRef.current?.scene?.();
      if (!scene) {
        timer = setTimeout(init, 100);
        return;
      }

      controller = new PlanetExplosionController(scene, {
        onGlobeVisibility: (visible) => {
          setIsGlobeVisible(visible);
          if (globeRef.current?.showGlobe) {
            globeRef.current.showGlobe(visible);
          }
          if (globeRef.current?.showAtmosphere) {
            globeRef.current.showAtmosphere(visible);
          }
        },
        onShake: (x, y) => {
          if (containerRef.current) {
            containerRef.current.style.transform = (x === 0 && y === 0)
              ? ''
              : `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          }
        },
        onPhaseChange: (phase, mode) => {
          setExplosionPhase(phase);
          if (mode) setExplosionMode(mode);
        }
      });

      explosionControllerRef.current = controller;
    };

    init();

    return () => {
      if (timer) clearTimeout(timer);
      controller?.dispose();
      explosionControllerRef.current = null;
    };
  }, []);

  useKonamiCode(useCallback(() => {
    explosionControllerRef.current?.start('konami');
  }, []));

  useEffect(() => {
    (window as any).__resetPlanet = () => explosionControllerRef.current?.start('reset');
    (window as any).__explodePlanet = () => explosionControllerRef.current?.start('konami');
    return () => {
      delete (window as any).__resetPlanet;
      delete (window as any).__explodePlanet;
    };
  }, []);

  const lastResetNonceRef = useRef(resetNonce);
  useEffect(() => {
    if (!resetNonce) return;
    if (resetNonce === lastResetNonceRef.current) return;
    lastResetNonceRef.current = resetNonce;

    explosionControllerRef.current?.start('reset');
  }, [resetNonce]);




  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !dimensions.width || !dimensions.height) return;


    if (hasSavedCameraPositionRef.current) return;

    const timer = window.setTimeout(() => {
      const target = fitAltitude(dimensions.width, dimensions.height);
      const current = globe.pointOfView().altitude;


      if (appliedAltitudeRef.current !== null && Math.abs(current - appliedAltitudeRef.current) > 0.05) {
        return;
      }
      if (Math.abs(current - target) < 0.01) {
        appliedAltitudeRef.current = target;
        return;
      }

      globe.pointOfView({ altitude: target });
      appliedAltitudeRef.current = target;
    }, RESIZE_SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [dimensions.width, dimensions.height]);




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

      let color = "#a1a1aa";
      let altitude = 0.05;

      if (isFailed) {
        color = "#ef4444";
      } else if (mode === 'resilience') {
        color = criticalityLevel(sat.criticality).color;
      } else if (routeColour) {
        color = routeColour;
      } else if (mode === 'simulation') {
        color = sat.color;
      }




      const emphasized = isFailed || isSelected;



      const grow = sat.id === selectedSatellite ? 1 : 0;

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
  }, [satellites, selectedSatellite, routeNodes, mode, playing]);











  const objectDatums = useRef(new Map<string, any>());

  const objectsData = useMemo(() => {
    const store = objectDatums.current;
    const live = new Set<string>();

    const data = pointsData.map(point => {
      live.add(point.id);
      const datum = store.get(point.id) ?? {};
      Object.assign(datum, point);
      store.set(point.id, datum);
      return datum;
    });

    store.forEach((_, id) => {
      if (!live.has(id)) store.delete(id);
    });

    return data;
  }, [pointsData]);



  useEffect(() => {
    objectsData.forEach(datum => {
      const group = satelliteGroups.current.get(datum.id);
      if (group) dressSatellite(group, datum);
    });

  }, [objectsData]);

  const coverageColor = pointsData.find(sat => sat.id === coverageSatelliteId)?.color ?? '#ffffff';

  useEffect(() => {
    coverageCapMaterial.color.set(coverageColor);
  }, [coverageCapMaterial, coverageColor]);



  const coverageDegrees = (contactRadiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);


  const failureRingSpeedDegS = coverageDegrees / (FAILURE_RING_FLIGHT_MS / 1000);




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





  useEffect(() => {
    if (!playing) return;

    const groups = satelliteGroups.current;
    const flights = new Map<
      THREE.Object3D,
      {
        prev: THREE.Vector3;
        prevAt: number;
        curr: THREE.Vector3;
        currAt: number;
        drawn: THREE.Vector3;
      }
    >();
    const plates: THREE.Object3D[] = [];
    const step = new THREE.Vector3();
    let gapAverage = 0;
    let trail = MIN_TRAIL_MS;
    let sinceSweep = Infinity;
    let frame = 0;
    let last = performance.now();




    const sweep = () => {
      const scene = globeRef.current?.scene?.();
      if (!scene) return;
      plates.length = 0;
      scene.traverse((object: any) => {
        if (object?.element?.dataset?.flyId) plates.push(object);
      });
    };

    const fly = (object: THREE.Object3D, now: number, smooth: number) => {
      const flight = flights.get(object);

      if (!flight) {
        flights.set(object, {
          prev: object.position.clone(),
          prevAt: now,
          curr: object.position.clone(),
          currAt: now,


          drawn: object.position.clone(),
        });
        return;
      }



      if (!object.position.equals(flight.drawn)) {
        step.copy(object.position).sub(flight.curr);
        const gap = Math.max(16, now - flight.currAt);
        const travelled = flight.curr.distanceTo(flight.prev);
        const jumped = travelled > 0
          ? step.length() > TELEPORT_RATIO * travelled
          : step.length() > TELEPORT_DISTANCE;

        if (jumped) {


          flight.prev.copy(object.position);
          flight.curr.copy(object.position);
          flight.drawn.copy(object.position);
          flight.prevAt = now;
          flight.currAt = now;
          return;
        }

        flight.prev.copy(flight.curr);
        flight.prevAt = flight.currAt;
        flight.curr.copy(object.position);
        flight.currAt = now;

        gapAverage = gapAverage === 0 ? gap : gapAverage + (gap - gapAverage) * GAP_BLEND;
        trail = Math.min(MAX_TRAIL_MS, Math.max(MIN_TRAIL_MS, gapAverage * TRAIL_SHARE));
      }

      const span = flight.currAt - flight.prevAt;
      const along = span > 0
        ? Math.min(SEGMENT_OVERRUN, Math.max(0, (now - trail - flight.prevAt) / span))
        : 1;

      step.lerpVectors(flight.prev, flight.curr, along);
      flight.drawn.lerp(step, smooth);
      object.position.copy(flight.drawn);
    };

    const advance = () => {
      const now = performance.now();
      const delta = Math.min(80, now - last);
      last = now;
      sinceSweep += delta;

      if (sinceSweep > PLATE_SWEEP_MS) {
        sweep();
        sinceSweep = 0;
      }

      const smooth = 1 - Math.exp(-delta / SMOOTH_MS);



      groups.forEach(group => {
        const placed = group.parent ?? group;
        fly(placed, now, smooth);
      });
      plates.forEach(plate => fly(plate, now, smooth));
    };








    const scene = globeRef.current?.scene?.();
    const updateMatrices = scene?.updateMatrixWorld?.bind(scene);

    if (scene && updateMatrices) {
      scene.updateMatrixWorld = (force?: boolean) => {
        advance();
        updateMatrices(force);
      };
    }

    const tick = () => {
      if (!updateMatrices) advance();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      if (scene && updateMatrices) scene.updateMatrixWorld = updateMatrices;

      flights.forEach((flight, object) => object.position.copy(flight.curr));
    };
  }, [playing]);

  const highlightedPlane = useMemo(
    () => satellites.find(s => s.id === selectedSatellite)?.planeId ?? null,
    [satellites, selectedSatellite]
  );


  const selectedCoverage = useMemo(() => {
    const satellite = satellites.find(sat => sat.id === coverageSatelliteId);
    if (!satellite) return null;

    const boundary = coverageRing(satellite.lat, satellite.lon, contactRadiusKm);

    return {
      geometry: {
        type: 'Polygon',
        coordinates: [boundary.map(point => [point.lng, point.lat])]
      },
      borderPoints: boundary.map(point => [point.lat, point.lng, 0.008] as [number, number, number]),
      color: coverageColor,
      curvature: GAP_CAP_CURVATURE
    };
  }, [satellites, coverageSatelliteId, contactRadiusKm, coverageColor]);

  const gapCoverage = useMemo(() => {
    return coverageGaps.map(gap => {
      const color = pointsData.find(point => point.id === gap.id)?.color ?? '#ffffff';
      const boundary = coverageRing(gap.lat, gap.lon, contactRadiusKm);

      return {
        geometry: {
          type: 'Polygon',
          coordinates: [boundary.map(point => [point.lng, point.lat])]
        },
        borderPoints: boundary.map(point => [point.lat, point.lng, 0.008] as [number, number, number]),
        color,
        material: gapCapMaterial(color),




        curvature: GAP_CAP_CURVATURE
      };
    });

  }, [coverageGaps, contactRadiusKm, pointsData]);


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





      let color = 'rgba(125,211,252,0.5)';
      let stroke = 0.26;

      if (routeEdge) {
        color = routeEdge.focused ? routeEdge.color : `${routeEdge.color}b3`;
        stroke = routeEdge.focused ? 0.62 : 0.42;
      } else if (link.kind === 'masked') {


        color = 'rgba(251,113,133,0.55)';
        stroke = 0.18;
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
        dashLength: routeEdge ? 0.5 : link.kind === 'masked' ? 0.08 : 1,
        dashGap: routeEdge ? 0.2 : link.kind === 'masked' ? 0.06 : 0,
        stroke
      };
    }).filter((arc): arc is NonNullable<typeof arc> => arc !== null);
  }, [links, satellites, groundStations, gateways, routeEdges, highlightedPlane]);





  const pathsData = useMemo(() => {
    const orbitPaths = orbits.map(orbit => {
      const isHighlighted = orbit.planeId === highlightedPlane;
      const base = orbit.color;

      return {
        points: orbit.points.map(p => [p.lat, p.lng, SATELLITE_ALTITUDE] as [number, number, number]),
        color: orbit.pending ? `${base}33` : isHighlighted ? base : `${base}e6`,
        stroke: orbit.pending ? 0.2 : isHighlighted ? 0.55 : 0.42,


        dashLength: 0.016,
        dashGap: 0.01,
        dashAnimateTime: 0
      };
    });



    const gapPaths = gapCoverage.map(gap => ({
      points: gap.borderPoints,
      color: `#${new THREE.Color(gap.color).getHexString()}e6`,
      stroke: 0.34,
      dashLength: 0.05,
      dashGap: 0.035,
      dashAnimateTime: 0
    }));

    if (!selectedCoverage) return [...orbitPaths, ...gapPaths];

    return [
      ...orbitPaths,
      ...gapPaths,
      {
        points: selectedCoverage.borderPoints,
        color: `#${new THREE.Color(selectedCoverage.color).getHexString()}e6`,
        stroke: 0.34,
        dashLength: 0.05,
        dashGap: 0.035,
        dashAnimateTime: 0
      }
    ];
  }, [orbits, highlightedPlane, selectedCoverage, gapCoverage]);


  const satelliteChipData = useRef(new Map<string, any>());

  const satelliteChipStyles = useRef(new Map<string, (emphasized: boolean, accent: string) => void>());



  const htmlElementsData = useMemo(() => {
    const data: any[] = [];







    const store = satelliteChipData.current;
    const live = new Set<string>();

    satellites.forEach(sat => {
      live.add(sat.id);
      const datum = store.get(sat.id) ?? { type: 'sat', id: sat.id };
      datum.lat = sat.lat;
      datum.lng = sat.lon;
      datum.alt = SATELLITE_ALTITUDE;
      datum.sat = sat;
      datum.accent = sat.failed ? '#e4483a' : sat.color;
      datum.emphasized = sat.failed || sat.id === selectedSatellite || routeNodes.has(sat.id);
      store.set(sat.id, datum);
      data.push(datum);
    });

    store.forEach((_, id) => {
      if (!live.has(id)) {
        store.delete(id);
        satelliteChipStyles.current.delete(id);
      }
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



  useEffect(() => {
    satellites.forEach(sat => {
      satelliteChipStyles.current.get(sat.id)?.(
        sat.failed || sat.id === selectedSatellite || routeNodes.has(sat.id),
        sat.failed ? '#e4483a' : sat.color
      );
    });
  }, [satellites, selectedSatellite, routeNodes]);




  const createHtmlElement = useCallback((d: any) => {
    const el = document.createElement('div');



    if (d.type === 'sat') {


      el.dataset.flyId = d.id;
      el.style.cssText = 'position:relative;width:0;height:0;overflow:visible;pointer-events:none;white-space:nowrap;font-family:\'IBM Plex Mono\', ui-monospace, SFMono-Regular, Menlo, monospace';

      const chip = document.createElement('div');
      chip.textContent = d.id;
      chip.style.cssText = [
        'position:absolute',
        'left:9px',
        'top:0',
        'transform:translateY(-50%)',
        'padding:2px 5px',
        'border-radius:3px',
        'background:rgba(3,7,18,0.82)',
        'font-size:9px',
        'line-height:11px',
        'letter-spacing:0.04em',
        'font-weight:500',
        'pointer-events:auto',
        'cursor:pointer'
      ].join(';');




      let idleBorder = 'rgba(63,63,70,0.9)';
      let idleColor = '#a1a1aa';
      let hovered = false;

      const applyEmphasis = (emphasized: boolean, accent: string) => {
        idleBorder = emphasized ? accent : 'rgba(63,63,70,0.9)';
        idleColor = emphasized ? accent : '#a1a1aa';
        chip.style.fontWeight = emphasized ? '700' : '500';
        chip.style.boxShadow = emphasized
          ? `0 0 10px ${accent}55`
          : '0 2px 6px rgba(0,0,0,0.5)';
        if (hovered) return;
        chip.style.borderColor = idleBorder;
        chip.style.color = idleColor;
      };

      chip.style.border = '1px solid transparent';
      applyEmphasis(Boolean(d.emphasized), d.accent);
      satelliteChipStyles.current.set(d.id, applyEmphasis);

      chip.addEventListener('pointerenter', () => {
        hovered = true;
        chip.style.borderColor = '#e4e4e7';
        chip.style.color = '#fafafa';
      });
      chip.addEventListener('pointerleave', () => {
        hovered = false;
        chip.style.borderColor = idleBorder;
        chip.style.color = idleColor;
      });



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


    const labelOffset = d.labelOffset ?? { x: 0, y: 0 };

    el.style.cssText = [
      `pointer-events:${isGateway ? 'none' : 'auto'}`,
      'white-space:nowrap',
      'font-family:ui-monospace, SFMono-Regular, Menlo, monospace'
    ].join(';');



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



    if (d.offline) {
      const warn = document.createElement('div');
      warn.textContent = '!';
      warn.style.cssText = [
        'position:absolute',

        'left:-25px',
        'top:-6px',
        'width:12px',
        'height:12px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'border:1px solid #e4483a',
        'border-radius:2px',
        'background:rgba(3,7,18,0.9)',
        'color:#e4483a',
        'font-size:9px',
        'font-weight:700',
        'line-height:1'
      ].join(';');
      content.appendChild(warn);
    }

    const label = document.createElement('div');
    const labelBorder = isGateway ? 'rgba(251,191,36,0.75)' : `${accent}c7`;
    label.style.cssText = `position:absolute;left:${10 + labelOffset.x}px;top:${-11 + labelOffset.y}px;display:flex;flex-direction:column;gap:0;padding:2px 5px;border:1px solid ${d.focused ? '#fafafa' : labelBorder};border-radius:3px;background:rgba(3,7,18,0.9);box-shadow:${d.focused ? `0 0 12px ${accentDim},` : ''}0 3px 10px rgba(0,0,0,0.42);`;

    if (!isGateway && siteClickRef.current) {
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
        siteClickRef.current?.(d.id);
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
  }, [onPointClick]);

  return (
    <div
      ref={containerRef}
      className="isolate relative z-0 flex h-full w-full items-center justify-center overflow-hidden"
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




        globeImageUrl="/textures/earth-blue-marble.jpg"
        bumpImageUrl="/textures/earth-topology.png"
        backgroundColor="rgba(0,0,0,0)"
        onZoom={handleZoom}

        showGlobe={isGlobeVisible}
        showAtmosphere={isGlobeVisible}

        pointsData={isGlobeVisible ? (playing ? [] : pointsData) : []}
        pointLat="lat"
        pointLng="lon"
        pointColor="color"
        pointAltitude="globeAltitude"
        pointRadius="radius"
        pointResolution={32}
        pointsTransitionDuration={0}
        onPointClick={(pt: any) => onPointClick(pt)}
        pointLabel={satelliteTooltip}

        objectsData={isGlobeVisible ? objectsData : []}
        objectLat="lat"
        objectLng="lon"
        objectAltitude="globeAltitude"
        objectThreeObject={satelliteSphere}
        objectLabel={satelliteTooltip}
        onObjectClick={(obj: any) => onPointClick(obj)}

        arcsData={isGlobeVisible ? arcsData : []}
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




        arcCurveResolution={16}
        arcCircularResolution={4}
        arcsTransitionDuration={0}

        polygonsData={isGlobeVisible ? (selectedCoverage ? [...gapCoverage, selectedCoverage] : gapCoverage) : []}
        polygonGeoJsonGeometry="geometry"
        polygonCapMaterial={(d: any) => d.material ?? coverageCapMaterial}
        polygonSideColor="rgba(148,163,184,0)"
        polygonStrokeColor={null}
        polygonAltitude={0.006}
        polygonCapCurvatureResolution={(d: any) => d.curvature ?? 1}
        polygonsTransitionDuration={0}

        ringsData={isGlobeVisible ? failurePingData : []}
        ringLat="lat"
        ringLng="lng"
        ringAltitude={0.01}
        ringColor={() => failureRingFade}
        ringMaxRadius={coverageDegrees}
        ringPropagationSpeed={failureRingSpeedDegS}
        ringRepeatPeriod={FAILURE_RING_INTERVAL_MS}
        ringResolution={96}

        pathsData={isGlobeVisible ? pathsData : []}
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

        htmlElementsData={isGlobeVisible ? htmlElementsData : []}
        htmlAltitude={(d: any) => d.alt ?? 0}
        htmlTransitionDuration={0}
        htmlElement={createHtmlElement}
      />

      {explosionPhase === 'exploding' && explosionMode === 'konami' && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(239,68,68,0.25)_100%)] shadow-[inset_0_0_80px_rgba(239,68,68,0.35)]" />
      )}

      {explosionPhase !== 'idle' && explosionPhase !== 'restored' && explosionMode === 'konami' && (
        <div className="pointer-events-auto absolute top-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 border border-red-500/50 bg-black/90 px-4 py-2 shadow-[0_0_30px_rgba(239,68,68,0.45)] backdrop-blur-md transition-all">
          <div className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[11px] font-bold tracking-wider text-red-400 uppercase">
              {explosionPhase === 'buildup'
                ? '⚠ КРИТИЧЕСКАЯ ПЕРЕГРУЗКА ЯДРА'
                : explosionPhase === 'reassembling'
                  ? '↺ ГРАВИТАЦИОННОЕ ВОССТАНОВЛЕНИЕ'
                  : '💥 ВЗРЫВ ПЛАНЕТЫ (КОД KONAMI)'}
            </span>
            <span className="font-mono text-[9px] text-zinc-400">
              {explosionPhase === 'reassembling'
                ? 'Сборка тектонических плит...'
                : 'Разрушение коры и мантии. Земля уничтожена.'}
            </span>
          </div>
          {explosionPhase === 'exploding' && (
            <button
              type="button"
              onClick={() => explosionControllerRef.current?.requestReassemble()}
              className="ml-2 cursor-pointer rounded border border-red-500/60 bg-red-500/20 px-2.5 py-1 font-mono text-[10px] font-semibold text-red-200 transition hover:bg-red-500/35 active:scale-95"
            >
              Восстановить
            </button>
          )}
        </div>
      )}
    </div>
  );

  function satelliteTooltip(sat: any) {
    return `
      <div style="background:#000;padding:4px 8px;border:1px solid #2e2e34;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;color:#e4e4e7;">
        ${sat.id}<br/>
        <span style="color:#71717a">${t('map.alt')} ${t('sat.km', { value: sat.altitudeKm.toFixed(0) })}</span>
      </div>
    `;
  }

};
