'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { useSession } from '@/entities/session';
import { isFiniteNumber, isRecord, readStored, writeStored } from '@/shared/lib';
import type { LinkView, SatelliteView } from '@/entities/satellite';
import type { GroundSiteView } from '@/entities/ground-site';
import type { RouteTrace } from '@/entities/simulation';
import { GlobeBoundary } from './globe-boundary';
import type { GlobeCameraPosition, OrbitTrack } from './globe';

const Globe = dynamic(() => import('./globe').then((module) => module.Globe), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black" />,
});

const Map2D = dynamic(() => import('./map-2d').then((module) => module.Map2D), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black" />,
});

interface ViewportProps {
  satellites: SatelliteView[];
  links: LinkView[];
  clients: GroundSiteView[];
  gateways: GroundSiteView[];
  routes: RouteTrace[];
  focusClientId: string | null;
  orbits: OrbitTrack[];
  mode?: 'simulation' | 'resilience';
  contactRadiusKm: number;
}

/** Where the globe was left, so a reload keeps the framing the user set. */
const CAMERA_KEY = 'orbitguard-globe-camera-v1';

const isCamera = (value: unknown): value is GlobeCameraPosition =>
  isRecord(value)
  && isFiniteNumber(value.lat)
  && isFiniteNumber(value.lng)
  && isFiniteNumber(value.altitude);

export function Viewport({
  satellites,
  links,
  clients,
  gateways,
  routes,
  focusClientId,
  orbits,
  mode = 'simulation',
  contactRadiusKm,
}: ViewportProps) {
  const { state, dispatch } = useSession();
  const [webglBroken, setWebglBroken] = useState(false);

  // Switching to the flat map unmounts the globe, and so does a reload. The
  // camera is kept out here — and written through to storage — so coming back
  // lands on the view the user left, not on the default framing. A ref rather
  // than state: the globe reads it once, at mount, and storing it would
  // otherwise re-render the whole viewport on every drag.
  const camera = useRef<GlobeCameraPosition | undefined>(undefined);
  const cameraRead = useRef(false);
  if (!cameraRead.current) {
    cameraRead.current = true;
    camera.current = readStored(CAMERA_KEY, isCamera) ?? undefined;
  }

  useEffect(() => {
    if (webglBroken && state.viewMode === '3d') {
      dispatch({ type: 'setViewMode', viewMode: '2d' });
    }
  }, [webglBroken, state.viewMode, dispatch]);

  const select = (satellite: SatelliteView) =>
    dispatch({ type: 'selectSatellite', satelliteId: satellite.id });

  const selectSite = (siteId: string) => dispatch({ type: 'selectClient', clientId: siteId });

  const flatMap = (
    <Map2D
      satellites={satellites}
      links={links}
      groundStations={clients}
      gateways={gateways}
      routes={routes}
      focusClientId={focusClientId}
      onSiteClick={selectSite}
      onSatelliteClick={select}
      selectedSatellite={state.selectedSatelliteId}
      mode={mode}
      contactRadiusKm={contactRadiusKm}
    />
  );

  const showGlobe = state.viewMode === '3d' && !webglBroken;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={showGlobe ? '3d' : '2d'}
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.012 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        {showGlobe ? (
          <GlobeBoundary fallback={flatMap} onFail={() => setWebglBroken(true)}>
            <Globe
              satellites={satellites}
              links={links}
              groundStations={clients}
              gateways={gateways}
              routes={routes}
              focusClientId={focusClientId}
              onSiteClick={selectSite}
              orbits={orbits}
              playing={state.playing}
              cameraPosition={camera.current}
              onCameraPositionChange={(position) => {
                camera.current = position;
                writeStored(CAMERA_KEY, position);
              }}
              onSatelliteClick={select}
              selectedSatellite={state.selectedSatelliteId}
              focusOn={state.focusRequest}
              mode={mode}
              contactRadiusKm={contactRadiusKm}
            />
          </GlobeBoundary>
        ) : (
          flatMap
        )}

        {webglBroken && (
          <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 border border-rule-strong bg-black/85 px-3 py-1.5 font-label text-[11px] text-zinc-400 backdrop-blur">
            This browser has no WebGL, so the flat map is shown instead of the globe.
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
