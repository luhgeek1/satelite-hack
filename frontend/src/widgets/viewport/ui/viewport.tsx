'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { useSession } from '@/entities/session';
import { isFiniteNumber, isRecord, readStored, writeStored } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { LinkView, SatelliteView } from '@/entities/satellite';
import type { GroundSiteView } from '@/entities/ground-site';
import type { RouteTrace } from '@/entities/simulation';
import { coverageGaps } from '../model/coverage-gaps';
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
  const { t } = useI18n();
  const [webglBroken, setWebglBroken] = useState(false);






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





  const [dismissedSiteId, setDismissedSiteId] = useState<string | null>(null);





  const pickedSiteId = state.selectedClientId;



  useEffect(() => {
    setDismissedSiteId(null);
  }, [pickedSiteId]);

  const selectSite = (siteId: string) => {


    const nodePicked = Boolean(state.selectedSatelliteId);
    if (nodePicked) dispatch({ type: 'selectSatellite', satelliteId: null });

    if (siteId !== pickedSiteId) {
      setDismissedSiteId(null);
      dispatch({ type: 'selectClient', clientId: siteId });
      return;
    }




    setDismissedSiteId((current) => (nodePicked || current === siteId ? null : siteId));
  };






  const gaps = useMemo(
    () =>
      dismissedSiteId === pickedSiteId || state.selectedSatelliteId || !pickedSiteId
        ? []
        : coverageGaps(
            clients.find((client) => client.id === pickedSiteId),
            routes.find((route) => route.clientId === pickedSiteId),
            satellites,
            contactRadiusKm,
          ),
    [
      dismissedSiteId,
      state.selectedSatelliteId,
      clients,
      routes,
      pickedSiteId,
      satellites,
      contactRadiusKm,
    ],
  );

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
      coverageGaps={gaps}
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
              coverageGaps={gaps}
              resetNonce={state.resetNonce}
            />
          </GlobeBoundary>
        ) : (
          flatMap
        )}

        {webglBroken && (
          <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 border border-rule-strong bg-black/85 px-3 py-1.5 font-label text-[11px] text-zinc-400 backdrop-blur">
            {t('view.noWebgl')}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
