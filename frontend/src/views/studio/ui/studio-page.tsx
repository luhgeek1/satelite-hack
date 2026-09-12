'use client';

import { useEffect, useMemo } from 'react';
import { Activity, PanelRightClose, PanelRightOpen, ShieldAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AppHeader } from '@/widgets/app-header';
import { CompareBoard } from '@/widgets/compare-board';
import { ConfigPanel } from '@/widgets/config-panel';
import { CriticalNodes } from '@/widgets/critical-nodes';
import { NetworkHealth } from '@/widgets/network-health';
import { PlaybackBar } from '@/widgets/playback-bar';
import { SatelliteDetails } from '@/widgets/satellite-details';
import { Viewport, type OrbitTrack } from '@/widgets/viewport';
import { ViewToggle } from '@/features/toggle-view';
import { useInjectFailure, useRestoreSatellite } from '@/features/inject-failure';
import { impactIndex, useResilience } from '@/features/analyze-resilience';
import { snapToGrid, usePlayback } from '@/features/timeline-playback';
import { planeColorMap, readGeometry, useScenario, useScenarios } from '@/entities/scenario';
import { allFailedIds, useSession } from '@/entities/session';
import {
  isSettling,
  outageBands,
  useAvailabilitySeries,
  useDebouncedRunInput,
  useSimulation,
  useSnapshot,
  useSnapshotPrefetch,
} from '@/entities/simulation';
import { buildLinkViews, buildSatelliteViews } from '@/entities/satellite';
import { clientsOf, gatewaysOf, groundSitesOf } from '@/entities/ground-site';
import {
  cn,
  contactRadiusKm,
  criticalityLevel,
  earthRotationDeg,
  orbitTrack,
  useDisableBrowserZoom,
  useMediaQuery,
} from '@/shared/lib';
import { EmptyState, ErrorNote, MobileDrawer } from '@/shared/ui';
import { simulationsApi } from '@/shared/api';
import { useLocalPanels } from '../model/use-local-panels';

const SPRING = { type: 'spring', stiffness: 360, damping: 36, mass: 0.9 } as const;

export function StudioPage() {
  const { state, dispatch } = useSession();
  const scenarios = useScenarios();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useDisableBrowserZoom();
  const panels = useLocalPanels();

  useEffect(() => {
    if (!state.scenarioId && scenarios.data?.length) {
      dispatch({ type: 'selectScenario', scenarioId: scenarios.data[0].id });
    }
  }, [scenarios.data, state.scenarioId, dispatch]);

  const scenarioQuery = useScenario(state.scenarioId);
  const scenario = scenarioQuery.data?.scenario;
  const geometry = scenario ? readGeometry(scenario) : null;
  const colors = useMemo(() => planeColorMap(scenario), [scenario]);

  const liveInput = {
    scenarioId: state.scenarioId,
    config: state.config,
    strategy: state.strategy,
  };
  const runInput = useDebouncedRunInput(liveInput);
  const settling = isSettling(liveInput, runInput);

  const simulation = useSimulation(runInput);
  const summary = simulation.data;

  const stepS = geometry?.stepS ?? 120;
  const horizonS = geometry?.horizonS ?? 86_400;
  const tS = snapToGrid(state.tS, stepS);

  const snapshot = useSnapshot(summary?.id, tS);
  const availability = useAvailabilitySeries(summary?.id);
  const prefetch = useSnapshotPrefetch(summary?.id, stepS, horizonS);

  const playback = usePlayback(stepS, horizonS);

  useEffect(() => {
    if (state.playing) prefetch(tS, 4);
  }, [state.playing, tS, prefetch]);

  const resilience = useResilience(runInput, state.tab === 'resilience');
  const impacts = useMemo(() => impactIndex(resilience.data?.impacts), [resilience.data]);

  const injectFailure = useInjectFailure(summary?.id, tS, horizonS);
  const restore = useRestoreSatellite();

  const launchStage = state.config.launch_stage ?? scenario?.design.launch_stage ?? 3;
  const failedIds = useMemo(() => allFailedIds(state.config), [state.config]);

  const satellites = useMemo(
    () =>
      buildSatelliteViews({
        scenario,
        states: snapshot.data?.satellites,
        launchStage,
        failedIds,
        impacts,
        colors,
      }),
    [scenario, snapshot.data, launchStage, failedIds, impacts, colors],
  );

  const visibleSatellites = useMemo(
    () => satellites.filter((satellite) => satellite.deployed),
    [satellites],
  );

  const links = useMemo(() => buildLinkViews(snapshot.data?.edges), [snapshot.data]);
  const sites = useMemo(() => groundSitesOf(scenario), [scenario]);
  const clients = useMemo(() => clientsOf(scenario), [scenario]);
  const gateways = useMemo(() => gatewaysOf(scenario), [scenario]);

  const focusClientId = state.selectedClientId ?? summary?.clients[0]?.client_id ?? null;
  const activeRoute = useMemo(() => {
    const route = snapshot.data?.routes.find((item) => item.client_id === focusClientId);
    return route?.path ?? [];
  }, [snapshot.data, focusClientId]);

  const orbits = useMemo<OrbitTrack[]>(() => {
    if (!scenario || !geometry) return [];
    const rotation = earthRotationDeg(tS, geometry.earthAngle0Deg);

    return scenario.design.planes
      .filter((plane) =>
        scenario.design.satellites.some(
          (satellite) => satellite.plane_id === plane.id && satellite.launch_batch <= launchStage,
        ),
      )
      .map((plane) => ({
        planeId: plane.id,
        color: colors[plane.id],
        points: orbitTrack(
          geometry.inclinationDeg,
          state.config.planes?.[plane.id]?.raan_deg ?? plane.raan_deg,
          rotation,
        ),
      }));
  }, [scenario, geometry, tS, launchStage, colors, state.config.planes]);

  const contactRadius = useMemo(
    () =>
      geometry ? contactRadiusKm(geometry.altitudeKm, geometry.minElevationDeg) : 0,
    [geometry],
  );

  const bands = useMemo(
    () => outageBands(availability.data, horizonS, stepS),
    [availability.data, horizonS, stepS],
  );

  const selectedSatellite = satellites.find(
    (satellite) => satellite.id === state.selectedSatelliteId,
  );

  const status = simulation.isError || scenarioQuery.isError
    ? 'error'
    : simulation.isFetching || snapshot.isFetching
      ? 'running'
      : summary
        ? 'ready'
        : 'idle';

  const exportHref = summary ? simulationsApi.exportUrl(summary.id) : null;
  const scenarioHref = summary ? simulationsApi.scenarioUrl(summary.id) : null;

  const dataColumn = (key: string, body: React.ReactNode) => (
    <>
      <AnimatePresence initial={false}>
        {!panels.hidden && (
          <motion.aside
            key={key}
            layout
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={SPRING}
            className="relative hidden min-h-0 flex-shrink-0 flex-col overflow-hidden border-l border-rule bg-black lg:flex"
          >
            <div className="flex min-h-0 w-[320px] flex-1 flex-col">
              <div className="flex flex-shrink-0 items-start justify-between border-b border-rule px-3 pb-2.5 pt-3">
                <div className="min-w-0">
                  <div className="font-label text-[11px] text-zinc-500">Scenario</div>
                  <div className="truncate font-data text-[13px] text-zinc-100">
                    {scenario?.meta.id ?? '—'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={panels.hide}
                  aria-label="Collapse panel"
                  className="text-zinc-600 transition-colors hover:text-zinc-200"
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
              {body}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panels.hidden && (
          <motion.button
            type="button"
            onClick={panels.show}
            aria-label="Open panel"
            initial={{ opacity: 0, scale: 0.92, x: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, x: 10 }}
            className="absolute right-3 top-3 z-30 hidden h-7 w-7 items-center justify-center border border-rule-strong bg-black/85 text-zinc-500 backdrop-blur transition-colors hover:border-zinc-600 hover:text-zinc-100 lg:flex"
          >
            <PanelRightOpen size={16} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );

  const mobileToggle = (label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={panels.openDrawer}
      className="absolute right-3 top-3 z-20 flex items-center gap-1.5 border border-rule-strong bg-black/85 px-2 py-1.5 font-label text-[12px] text-zinc-300 backdrop-blur lg:hidden"
    >
      {icon}
      {label}
    </button>
  );

  if (scenarioQuery.isError) {
    return (
      <div className="flex h-full w-full flex-col bg-black">
        <AppHeader status="error" />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md">
            <ErrorNote error={scenarioQuery.error} />
          </div>
        </div>
      </div>
    );
  }

  if (!scenario || !geometry) {
    return (
      <div className="flex h-full w-full flex-col bg-black">
        <AppHeader status={status} />
        <EmptyState title="Loading scenario catalog" hint="Connecting to the simulation service." />
      </div>
    );
  }

  const configBody = (
    <ConfigPanel
      scenario={scenario}
      satellites={satellites}
      sites={sites}
      colors={colors}
      onInjectFailure={(id) => injectFailure.mutate(id)}
      onRestore={restore}
      exportHref={exportHref}
      scenarioHref={scenarioHref}
    />
  );

  const resilienceBody = (
    <CriticalNodes
      scenario={scenario}
      resilience={resilience.data}
      loading={resilience.isLoading}
      error={resilience.error}
      colors={colors}
      runInput={runInput}
    />
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black font-sans text-zinc-300">
      <AppHeader status={status} />

      {state.tab === 'compare' ? (
        <CompareBoard />
      ) : (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <motion.div layout transition={SPRING} className="flex min-w-0 flex-1 flex-col bg-black">
            <div className="relative min-h-0 flex-1">
              <Viewport
                satellites={visibleSatellites}
                links={state.tab === 'simulation' ? links : []}
                clients={clients}
                gateways={gateways}
                activeRoute={state.tab === 'simulation' ? activeRoute : []}
                orbits={state.tab === 'simulation' ? orbits : []}
                mode={state.tab === 'resilience' ? 'resilience' : 'simulation'}
                contactRadiusKm={contactRadius}
              />

              <ViewToggle
                style={
                  isDesktop
                    ? { right: 24 + (panels.hidden ? 40 : state.selectedSatelliteId ? 320 : 0) }
                    : undefined
                }
              />

              {state.tab === 'simulation' && (
                <NetworkHealth
                  clients={summary?.clients ?? []}
                  target={summary?.target_availability ?? geometry.targetAvailability}
                  routes={snapshot.data?.routes ?? []}
                  selectedClientId={focusClientId}
                  onSelectClient={(clientId) => dispatch({ type: 'selectClient', clientId })}
                  stale={settling || simulation.isFetching || snapshot.isFetching}
                />
              )}

              {state.tab === 'resilience' && (
                <div className="absolute bottom-3 left-3 border border-rule-strong bg-black/80 p-3 backdrop-blur lg:bottom-auto lg:left-6 lg:top-6 lg:p-4">
                  <div className="mb-2 font-label text-[12px] text-zinc-300 lg:mb-3">Node criticality</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 lg:block lg:space-y-1.5">
                    {[0, 50, 75, 90].map((sample) => {
                      const level = criticalityLevel(sample);
                      return (
                        <div key={level.token} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0" style={{ background: level.color }} />
                          <span className="font-label text-[12px] text-zinc-400">{level.label}</span>
                          <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-zinc-600">
                            {level.token}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {mobileToggle(
                state.tab === 'resilience' ? 'Critical nodes' : 'Panel',
                state.tab === 'resilience' ? <ShieldAlert size={13} /> : <Activity size={13} />,
              )}

              {simulation.isError && (
                <div className="absolute bottom-3 left-1/2 z-20 w-[min(30rem,90vw)] -translate-x-1/2">
                  <ErrorNote error={simulation.error} />
                </div>
              )}
            </div>

            {state.tab === 'simulation' && (
              <PlaybackBar
                tS={tS}
                horizonS={horizonS}
                stepS={stepS}
                playing={playback.playing}
                speed={playback.speed}
                bands={bands}
                focusClientId={focusClientId}
                onToggle={playback.toggle}
                onSpeed={playback.setSpeed}
                onSeek={playback.seek}
              />
            )}
          </motion.div>

          <div
            className={cn(
              'relative hidden lg:flex',
              panels.hidden ? 'w-0' : 'w-[320px] flex-shrink-0',
            )}
          >
            {dataColumn(state.tab, state.tab === 'resilience' ? resilienceBody : configBody)}

            {state.selectedSatelliteId && !panels.hidden && (
              <SatelliteDetails
                satellite={selectedSatellite}
                links={links}
                activeRoute={activeRoute}
                hasResilience={Boolean(resilience.data)}
                pending={injectFailure.isPending}
                onInjectFailure={(id) => injectFailure.mutate(id)}
                onRestore={restore}
              />
            )}
          </div>

          <MobileDrawer
            open={panels.drawerOpen}
            title={state.tab === 'resilience' ? 'Critical nodes' : 'Configuration'}
            onClose={panels.closeDrawer}
          >
            {state.tab === 'resilience' ? resilienceBody : configBody}
            {state.selectedSatelliteId && (
              <SatelliteDetails
                satellite={selectedSatellite}
                links={links}
                activeRoute={activeRoute}
                hasResilience={Boolean(resilience.data)}
                pending={injectFailure.isPending}
                onInjectFailure={(id) => injectFailure.mutate(id)}
                onRestore={restore}
                placement="sidebar"
              />
            )}
          </MobileDrawer>
        </div>
      )}
    </div>
  );
}
