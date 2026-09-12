'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  freeLocks,
  toPlaneOverrides,
  useOptimizer,
  OptimizerProgress,
  OptimizerResult,
  type PlaneLock,
  type SearchDepth,
} from '@/features/run-optimizer';
import { useInjectFailure, useRestoreSatellite } from '@/features/inject-failure';
import type { OutageNode, OutageTarget, OutageWindow } from '@/features/schedule-outage';
import { impactIndex, useResilience } from '@/features/analyze-resilience';
import { snapToGrid, usePlayback } from '@/features/timeline-playback';
import { planeColorMap, readGeometry, useScenario, useScenarios } from '@/entities/scenario';
import { allFailedIds, useSession } from '@/entities/session';
import {
  buildRouteTraces,
  emptyConfig,
  isSettling,
  normalizeConfig,
  outageBands,
  useAvailabilitySeries,
  useDebouncedRunInput,
  useSimulation,
  useSnapshot,
  useSnapshotPrefetch,
  type RouteTrace,
} from '@/entities/simulation';
import { useSaveVariant, useVariants } from '@/entities/variant';
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
import { useI18n } from '@/shared/i18n';
import { simulationsApi, type ClientMetrics } from '@/shared/api';
import { useLocalPanels } from '../model/use-local-panels';

const SPRING = { type: 'spring', stiffness: 360, damping: 36, mass: 0.9 } as const;

/** Stable identity, so a run without a summary does not re-render the strip. */
const NO_CLIENTS: ClientMetrics[] = [];

export function StudioPage() {
  const { state, dispatch } = useSession();
  const { t } = useI18n();
  const scenarios = useScenarios();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useDisableBrowserZoom();
  const panels = useLocalPanels();

  // How much of the bottom the playback strip takes, so the optimizer card can
  // clear it whatever the scenario puts in it. A callback ref rather than an
  // effect: the strip appears only once a scenario has loaded, and an effect
  // keyed on the tab had already run — and found nothing — by then.
  const [playbackHeight, setPlaybackHeight] = useState(0);
  const playbackObserver = useRef<ResizeObserver | null>(null);

  const playbackRef = useCallback((node: HTMLDivElement | null) => {
    playbackObserver.current?.disconnect();

    if (!node) {
      setPlaybackHeight(0);
      return;
    }

    const observer = new ResizeObserver(([entry]) => setPlaybackHeight(entry.contentRect.height));
    observer.observe(node);
    playbackObserver.current = observer;
  }, []);

  useEffect(() => {
    const catalog = scenarios.data;
    if (!catalog?.length) return;
    // A restored id can name a scenario the service no longer serves, so the
    // catalog decides rather than the saved session.
    const known = catalog.some((item) => item.id === state.scenarioId);
    if (!state.scenarioId || !known) {
      dispatch({ type: 'selectScenario', scenarioId: catalog[0].id });
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
  const runInput = useDebouncedRunInput(liveInput, state.commitNonce);
  const settling = isSettling(liveInput, runInput);

  const simulation = useSimulation(runInput);
  const summary = simulation.data;

  // The scenario exactly as the file describes it. When nothing has been
  // changed this is the same content-addressed run as the one above, so it
  // costs nothing; once something is changed it is the reference every delta
  // in the panel is measured against.
  const baselineInput = useMemo(
    () => ({ scenarioId: state.scenarioId, config: emptyConfig, strategy: 'min_hops' as const }),
    [state.scenarioId],
  );
  const baseline = useSimulation(baselineInput).data;

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

  /**
   * What a window drawn on the strip does. Both kinds of node take the same
   * window, and passing `null` puts the node back — the picker is a list of
   * switches, not a one-way action. Held on the mutation's own `mutate` and on
   * `dispatch`, both stable, so the strip stays memoised.
   */
  const scheduleOutage = useCallback(
    (target: OutageTarget, window: OutageWindow | null) => {
      if (target.kind === 'satellite') {
        if (window) {
          injectFailure.mutate({ satelliteId: target.id, startS: window.startS, endS: window.endS });
        } else {
          dispatch({ type: 'removeFailure', satelliteId: target.id });
        }
        return;
      }

      if (window) {
        dispatch({
          type: 'addGatewayOutage',
          outage: { gateway_id: target.id, start_s: window.startS, end_s: window.endS },
        });
      } else {
        dispatch({ type: 'removeGatewayOutage', gatewayId: target.id });
      }
    },
    [injectFailure.mutate, dispatch],
  );

  // The search is owned here, not by a panel: it is started from the network
  // health card as well as from the resilience column, and it reports from a
  // fixed corner so the answer survives a tab change.
  const optimizer = useOptimizer(runInput, scenario);
  const [locks, setLocks] = useState<PlaneLock[]>([]);
  const [depth, setDepth] = useState<SearchDepth>('quick');
  // A search takes tens of seconds, so its answer stays on screen after it is
  // applied rather than vanishing with nothing to show it ever ran.
  const [optimizerApplied, setOptimizerApplied] = useState(false);
  const variants = useVariants();
  const saveVariant = useSaveVariant();

  const startOptimizer = useCallback(() => {
    setOptimizerApplied(false);
    optimizer.start.mutate({ locks, depth });
  }, [optimizer.start, locks, depth]);

  const dismissOptimizer = useCallback(() => {
    setOptimizerApplied(false);
    optimizer.dismiss();
  }, [optimizer]);

  const optimizedConfig = useCallback(() => {
    const found = optimizer.result ? toPlaneOverrides(optimizer.result.changed_planes) : {};
    return normalizeConfig({
      ...state.config,
      planes: { ...state.config.planes, ...found },
    });
  }, [optimizer.result, state.config]);

  const applyOptimizerResult = useCallback(() => {
    if (!optimizer.result) return;
    dispatch({ type: 'applyPlanes', planes: toPlaneOverrides(optimizer.result.changed_planes) });
    setOptimizerApplied(true);
  }, [optimizer.result, dispatch]);

  /**
   * Save what the search found and open it next to the untouched file.
   *
   * A comparison needs two named variants, and the one nobody thinks to save is
   * the baseline — so it is created here if it is missing rather than left as a
   * step the engineer has to know about.
   */
  const saveOptimizerResult = useCallback(
    async (name: string) => {
      if (!optimizer.result || !state.scenarioId) return;
      const scenarioId = state.scenarioId;

      const existingBaseline = variants.data?.find(
        (variant) =>
          variant.scenario_id === scenarioId
          && Object.keys(normalizeConfig(variant.config)).length === 0,
      );
      const baselineId =
        existingBaseline?.id
        ?? (
          await saveVariant.mutateAsync({
            scenario_id: scenarioId,
            name: `${scenarioId} · ${t('optimizer.baselineSuffix')}`,
            config: {},
            strategy: 'min_hops',
          })
        ).id;

      const saved = await saveVariant.mutateAsync({
        scenario_id: scenarioId,
        name,
        config: optimizedConfig(),
        strategy: state.strategy,
      });

      dispatch({ type: 'applyPlanes', planes: toPlaneOverrides(optimizer.result.changed_planes) });
      dispatch({ type: 'setCompareSlots', slots: [baselineId, saved.id] });
      dispatch({ type: 'setTab', tab: 'compare' });
      dismissOptimizer();
    },
    [
      optimizer.result,
      state.scenarioId,
      state.strategy,
      variants.data,
      saveVariant,
      optimizedConfig,
      dispatch,
      dismissOptimizer,
      t,
    ],
  );
  const planeIds = scenario?.design.planes.map((plane) => plane.id).join(',') ?? '';

  useEffect(() => {
    setLocks(planeIds ? freeLocks(planeIds.split(',')) : []);
  }, [planeIds]);

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

  const links = useMemo(
    () => buildLinkViews(snapshot.data?.edges, snapshot.data?.masked_satellites),
    [snapshot.data],
  );
  // The picker's two lists. Read off the scenario rather than the snapshot:
  // the strip is memoised, and a list rebuilt on every tick would re-render it
  // sixteen times a second for nothing.
  const satelliteNodes = useMemo<OutageNode[]>(
    () =>
      (scenario?.design.satellites ?? [])
        .filter((satellite) => satellite.launch_batch <= launchStage)
        .map((satellite) => ({ id: satellite.id, detail: satellite.plane_id })),
    [scenario, launchStage],
  );

  const sites = useMemo(() => groundSitesOf(scenario), [scenario]);
  const clients = useMemo(() => clientsOf(scenario), [scenario]);
  const gateways = useMemo(() => gatewaysOf(scenario), [scenario]);
  const gatewayNodes = useMemo<OutageNode[]>(
    () => gateways.map((gateway) => ({ id: gateway.id, detail: gateway.name })),
    [gateways],
  );

  const focusClientId = state.selectedClientId ?? summary?.clients[0]?.client_id ?? null;
  const routeTraces = useMemo<RouteTrace[]>(
    () =>
      buildRouteTraces(
        snapshot.data?.routes,
        clients.map((client) => client.id),
        focusClientId,
      ),
    [snapshot.data, clients, focusClientId],
  );

  // The rings are the most expensive thing a slider touches: every move rebuilds
  // a path per plane inside the globe. Deferring the value lets React drop the
  // intermediate positions when it cannot keep up, so the control itself and the
  // strip underneath stay at pointer speed while the rings follow a beat behind.
  const planeOverrides = useDeferredValue(state.config.planes);

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
          planeOverrides?.[plane.id]?.raan_deg ?? plane.raan_deg,
          rotation,
        ),
      }));
  }, [scenario, geometry, tS, launchStage, colors, planeOverrides]);

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

  const selectClient = useCallback(
    (clientId: string) => dispatch({ type: 'selectClient', clientId }),
    [dispatch],
  );

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
                  <div className="font-label text-[11px] text-zinc-500">{t('scenario.label')}</div>
                  <div className="truncate font-data text-[13px] text-zinc-100">
                    {scenario?.meta.id ?? '—'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={panels.hide}
                  aria-label={t('panel.collapse')}
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
            aria-label={t('panel.open')}
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
        <AppHeader />
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
        <AppHeader />
        <EmptyState title={t('scenario.loading')} hint={t('scenario.connecting')} />
      </div>
    );
  }

  const configBody = (
    <ConfigPanel
      scenario={scenario}
      satellites={satellites}
      sites={sites}
      colors={colors}
      onInjectFailure={(request) => injectFailure.mutate(request)}
      onRestore={restore}
      clients={summary?.clients ?? []}
      focusClientId={focusClientId}
      currentTS={tS}
      stepS={stepS}
      horizonS={horizonS}
      exportHref={exportHref}
      scenarioHref={scenarioHref}
      summary={summary}
      baseline={baseline}
    />
  );

  const resilienceBody = (
    <CriticalNodes
      resilience={resilience.data}
      loading={resilience.isLoading}
      error={resilience.error}
      colors={colors}
      runInput={runInput}
      optimizer={optimizer}
      onOptimize={startOptimizer}
      depth={depth}
      onDepthChange={setDepth}
      locks={locks}
      onLocksChange={setLocks}
    />
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black font-sans text-zinc-300">
      <AppHeader />

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
                routes={state.tab === 'simulation' ? routeTraces : []}
                focusClientId={focusClientId}
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
                  traces={routeTraces}
                  selectedClientId={focusClientId}
                  onSelectClient={selectClient}
                  stale={settling || simulation.isFetching || snapshot.isFetching}
                  optimizing={optimizer.running || optimizer.start.isPending}
                  onOptimize={startOptimizer}
                />
              )}

              {state.tab === 'resilience' && (
                <div className="absolute bottom-3 left-3 border border-rule-strong bg-black/80 p-3 backdrop-blur lg:bottom-auto lg:left-6 lg:top-6 lg:p-4">
                  <div className="mb-2 font-label text-[12px] text-zinc-300 lg:mb-3">{t('criticality.legend')}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 lg:block lg:space-y-1.5">
                    {[0, 50, 75, 90].map((sample) => {
                      const level = criticalityLevel(sample);
                      return (
                        <div key={level.tier} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0" style={{ background: level.color }} />
                          <span className="font-label text-[12px] text-zinc-400">
                            {t(`criticality.${level.tier}` as 'criticality.low')}
                          </span>
                          <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-zinc-600">
                            {t(`criticality.token.${level.tier}` as 'criticality.token.low')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {mobileToggle(
                state.tab === 'resilience' ? t('critical.title') : t('panel.mobile'),
                state.tab === 'resilience' ? <ShieldAlert size={13} /> : <Activity size={13} />,
              )}

              {simulation.isError && (
                <div className="absolute bottom-3 left-1/2 z-20 w-[min(30rem,90vw)] -translate-x-1/2">
                  <ErrorNote error={simulation.error} />
                </div>
              )}
            </div>

            {state.tab === 'simulation' && (
              <div ref={playbackRef}>
              <PlaybackBar
                tS={tS}
                horizonS={horizonS}
                stepS={stepS}
                playing={playback.playing}
                speed={playback.speed}
                bands={bands}
                clients={summary?.clients ?? NO_CLIENTS}
                target={summary?.target_availability ?? geometry.targetAvailability}
                focusClientId={focusClientId}
                satelliteNodes={satelliteNodes}
                gatewayNodes={gatewayNodes}
                onToggle={playback.toggle}
                onSpeed={playback.setSpeed}
                onSeek={playback.seek}
                onSelectClient={selectClient}
                onScheduleOutage={scheduleOutage}
              />
              </div>
            )}
          </motion.div>

          <div
            className={cn(
              'relative hidden lg:flex',
              panels.hidden ? 'w-0' : 'w-[320px] flex-shrink-0',
            )}
          >
            {dataColumn(state.tab, state.tab === 'resilience' ? resilienceBody : configBody)}

            <AnimatePresence initial={false}>
              {state.selectedSatelliteId && !panels.hidden && (
                <SatelliteDetails
                  satellite={selectedSatellite}
                  links={links}
                  routes={routeTraces}
                  hasResilience={Boolean(resilience.data)}
                  pending={injectFailure.isPending}
                  currentTS={tS}
                  onInjectFailure={(id) => injectFailure.mutate({ satelliteId: id })}
                  onRestore={restore}
                />
              )}
            </AnimatePresence>
          </div>

          <MobileDrawer
            open={panels.drawerOpen}
            title={state.tab === 'resilience' ? t('critical.title') : t('panel.configuration')}
            onClose={panels.closeDrawer}
          >
            {state.tab === 'resilience' ? resilienceBody : configBody}
            {state.selectedSatelliteId && (
              <SatelliteDetails
                satellite={selectedSatellite}
                links={links}
                routes={routeTraces}
                hasResilience={Boolean(resilience.data)}
                pending={injectFailure.isPending}
                currentTS={tS}
                onInjectFailure={(id) => injectFailure.mutate({ satelliteId: id })}
                onRestore={restore}
                placement="sidebar"
              />
            )}
          </MobileDrawer>
        </div>
      )}

      {/* The search runs against the whole scenario, so it reports from a fixed
          corner rather than from whichever panel started it. On the simulation
          tab it clears the playback strip. */}
      <AnimatePresence>
        {(optimizer.running || optimizer.start.isPending || optimizer.result) && (
          <motion.div
            className="fixed left-3 z-40 lg:left-6"
            /* Measured rather than guessed: the strip grows a row per ground
               site, and a fixed offset landed the card on top of it as soon as
               a scenario had three. */
            style={{ bottom: playbackHeight + 12 }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {optimizer.result ? (
              <OptimizerResult
                result={optimizer.result}
                scenario={scenario}
                colors={colors}
                applied={optimizerApplied}
                saving={saveVariant.isPending}
                onApply={applyOptimizerResult}
                onSaveAndCompare={saveOptimizerResult}
                onDismiss={dismissOptimizer}
              />
            ) : (
              <OptimizerProgress status={optimizer.status} remainingS={optimizer.remainingS} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
