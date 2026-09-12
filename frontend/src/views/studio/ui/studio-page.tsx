'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Check,
  Pencil,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AppHeader } from '@/widgets/app-header';
import { CompareBoard } from '@/widgets/compare-board';
import { ConfigPanel } from '@/widgets/config-panel';
import { CriticalNodes } from '@/widgets/critical-nodes';
import { NetworkHealth } from '@/widgets/network-health';
import { ResilienceSummary } from '@/widgets/resilience-summary';
import { PlaybackBar } from '@/widgets/playback-bar';
import { SatelliteDetails } from '@/widgets/satellite-details';
import { DeploymentPlan } from '@/widgets/deployment-plan';
import { Viewport, type OrbitTrack } from '@/widgets/viewport';
import { ViewToggle } from '@/features/toggle-view';
import { TourOverlay, useTour } from '@/features/guided-tour';
import {
  estimateSeconds,
  gridSize,
  toPlaneOverrides,
  useOptimizer,
  OptimizerProgress,
  OptimizerResult,
  type SearchDepth,
} from '@/features/run-optimizer';
import { useInjectFailure, useRestoreSatellite } from '@/features/inject-failure';
import type { OutageNode, OutageTarget, OutageWindow } from '@/features/schedule-outage';
import { impactIndex, useResilience } from '@/features/analyze-resilience';
import { useSensitivitySweeps } from '@/features/analyze-sensitivity';
import { snapToGrid, usePlayback } from '@/features/timeline-playback';
import {
  launchStages,
  locksForPlanning,
  planeColorMap,
  planeCommitStage,
  readGeometry,
  useRenameScenario,
  useScenario,
  useScenarios,
} from '@/entities/scenario';
import { allFailedIds, useSession } from '@/entities/session';
import {
  buildRouteTraces,
  emptyConfig,
  isSettling,
  normalizeConfig,
  outageBands,
  sameConfig,
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
  earthRotationDeg,
  orbitTrack,
  useDisableBrowserZoom,
  useMediaQuery,
} from '@/shared/lib';
import { EmptyState, ErrorNote, MobileDrawer } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';
import { simulationsApi, type ClientMetrics } from '@/shared/api';
import { useLocalPanels } from '../model/use-local-panels';
import { usePanelWidth } from '../model/use-panel-width';

const SPRING = { type: 'spring', stiffness: 360, damping: 36, mass: 0.9 } as const;

/** Stable identity, so a run without a summary does not re-render the strip. */
const NO_CLIENTS: ClientMetrics[] = [];

export function StudioPage() {
  const { state, dispatch } = useSession();
  const { t } = useI18n();
  const scenarios = useScenarios();
  const { autoStart, tour } = useTour();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const renameScenario = useRenameScenario();
  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  useDisableBrowserZoom();
  const panels = useLocalPanels();
  const panel = usePanelWidth();

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

    // The rendered height, not the laid-out one: the strip draws at the data
    // column's scale, and the card above it clears what is on screen.
    const observer = new ResizeObserver(() => setPlaybackHeight(node.getBoundingClientRect().height));
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

  // Only once the studio has something in it: a tour that lights up an empty
  // frame explains nothing, and every step points at a real element.
  const offered = useRef(false);

  useEffect(() => {
    if (!scenario || offered.current) return;
    offered.current = true;
    autoStart();
  }, [scenario, autoStart]);
  const geometry = scenario ? readGeometry(scenario) : null;
  const colors = useMemo(() => planeColorMap(scenario), [scenario]);
  const activeSummary = scenarios.data?.find((item) => item.id === state.scenarioId);

  const submitRename = () => {
    const title = renameDraft?.trim();
    if (title && activeSummary && title !== activeSummary.title) {
      renameScenario.mutate({ scenarioId: activeSummary.id, title });
    }
    setRenameDraft(null);
  };

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

  // Also while the studio tour runs: it visits this tab, and twenty seconds of
  // spinner is not something to point a newcomer at.
  const resilience = useResilience(runInput, state.tab === 'resilience' || tour === 'studio');

  // The sweeps for whatever is on screen when the page first settles, so the
  // resilience tab opens onto answers rather than spinners. Once only: a sweep
  // per slider move would queue three analyses behind every drag on a machine
  // with two cores. Later configurations are swept when the tab is opened.
  const [firstSettled, setFirstSettled] = useState<typeof runInput | null>(null);

  useEffect(() => {
    if (summary && !settling && firstSettled === null) setFirstSettled(runInput);
  }, [summary, settling, firstSettled, runInput]);

  useSensitivitySweeps(firstSettled ?? runInput, firstSettled !== null);
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
    (target: OutageTarget, window: OutageWindow, off: boolean) => {
      if (target.kind === 'satellite') {
        if (off) {
          injectFailure.mutate({ satelliteId: target.id, startS: window.startS, endS: window.endS });
        } else {
          // Only this window: the node may be down over another one as well.
          dispatch({ type: 'removeFailure', satelliteId: target.id, window });
        }
        return;
      }

      if (off) {
        dispatch({
          type: 'addGatewayOutage',
          outage: { gateway_id: target.id, start_s: window.startS, end_s: window.endS },
        });
      } else {
        dispatch({ type: 'removeGatewayOutage', gatewayId: target.id, window });
      }
    },
    [injectFailure.mutate, dispatch],
  );

  /** A window carries what was declared over it, so dropping one drops both. */
  const clearOutagesIn = useCallback(
    (window: OutageWindow) => dispatch({ type: 'clearOutagesIn', window }),
    [dispatch],
  );

  // The search is owned here, not by a panel: it is started from the network
  // health card as well as from the resilience column, and it reports from a
  // fixed corner so the answer survives a tab change.
  const optimizer = useOptimizer(runInput, scenario);
  const [planOpen, setPlanOpen] = useState(false);
  const [planScoredAt, setPlanScoredAt] = useState<number | null>(null);
  const [depth, setDepth] = useState<SearchDepth>('quick');
  // A search takes tens of seconds, so its answer stays on screen after it is
  // applied rather than vanishing with nothing to show it ever ran.
  const [optimizerApplied, setOptimizerApplied] = useState(false);
  const variants = useVariants();
  const saveVariant = useSaveVariant();

  /**
   * Plan the campaign from one launch onwards.
   *
   * Everything already in orbit is held: its angles were fixed when it flew and
   * an engineer cannot revisit them. This launch and every later one are chosen
   * together and scored on the finished constellation, because choosing a
   * launch for its own stage alone is measurably a trap — see DECISIONS E8.
   */
  const planFromStage = useCallback(
    (stage: number) => {
      if (!scenario) return;
      const stages = launchStages(scenario);
      const lastStage = stages[stages.length - 1]?.stage ?? 3;
      const staged = locksForPlanning(scenario, state.committedStages, stage);

      setOptimizerApplied(false);
      setPlanOpen(false);
      setPlanScoredAt(lastStage);
      optimizer.start.mutate({
        depth,
        locks: staged,
        config: { ...state.config, launch_stage: lastStage as 1 | 2 | 3 },
      });
    },
    [scenario, depth, optimizer.start, state.config, state.committedStages],
  );

  /** From the resilience ranking into the simulation: the loss, watched. */
  const failForDay = useCallback(
    (satelliteId: string) => {
      dispatch({
        type: 'addFailure',
        failure: { satellite_id: satelliteId, start_s: 0, end_s: horizonS },
      });
      dispatch({ type: 'setTab', tab: 'simulation' });
      // Selecting toggles, and the row that offered this has usually selected it.
      if (state.selectedSatelliteId !== satelliteId) {
        dispatch({ type: 'selectSatellite', satelliteId, focus: true });
      }
    },
    [dispatch, horizonS, state.selectedSatelliteId],
  );

  const dismissOptimizer = useCallback(() => {
    setOptimizerApplied(false);
    setPlanScoredAt(null);
    optimizer.dismiss();
  }, [optimizer]);

  /** The configuration the search was measured against, and the same one plus
   *  what it found. Both are built from the snapshot taken when the search
   *  started, so the pair reproduces the figures on the result card even if the
   *  angles have already been applied to the configuration on screen. */
  const searchedConfig = useCallback(
    () => normalizeConfig(optimizer.searched?.config ?? state.config),
    [optimizer.searched, state.config],
  );

  const optimizedConfig = useCallback(() => {
    const base = searchedConfig();
    const found = optimizer.result ? toPlaneOverrides(optimizer.result.changed_planes) : {};
    return normalizeConfig({ ...base, planes: { ...base.planes, ...found } });
  }, [optimizer.result, searchedConfig]);

  const applyOptimizerResult = useCallback(() => {
    if (!optimizer.result) return;
    dispatch({ type: 'applyPlanes', planes: toPlaneOverrides(optimizer.result.changed_planes) });
    setOptimizerApplied(true);
  }, [optimizer.result, dispatch]);

  /**
   * Save what the search found and open it next to what it was measured against.
   *
   * A comparison needs two named variants, and the one nobody thinks to save is
   * the baseline — so it is created here if it is missing rather than left as a
   * step the engineer has to know about.
   *
   * That baseline is the configuration the search started from, not the file as
   * it was loaded. A terminal moved into a forest, a failed satellite or a
   * different launch stage belongs on *both* sides: charging those to the
   * optimizer made a search that gained a point and a half read as a thirteen
   * point loss. The pair differs by the angles and nothing else.
   */
  const saveOptimizerResult = useCallback(
    async (name: string) => {
      if (!optimizer.result || !state.scenarioId) return;
      const scenarioId = state.scenarioId;
      const baselineConfig = searchedConfig();
      const strategy = optimizer.searched?.strategy ?? state.strategy;

      const existingBaseline = variants.data?.find(
        (variant) =>
          variant.scenario_id === scenarioId
          && variant.strategy === strategy
          && sameConfig(variant.config, baselineConfig),
      );
      const baselineId =
        existingBaseline?.id
        ?? (
          await saveVariant.mutateAsync({
            scenario_id: scenarioId,
            name: `${scenarioId} · ${t(
              Object.keys(baselineConfig).length === 0
                ? 'optimizer.baselineSuffix'
                : 'optimizer.beforeSuffix',
            )}`,
            config: baselineConfig,
            strategy,
          })
        ).id;

      const saved = await saveVariant.mutateAsync({
        scenario_id: scenarioId,
        name,
        config: optimizedConfig(),
        strategy,
      });

      dispatch({ type: 'applyPlanes', planes: toPlaneOverrides(optimizer.result.changed_planes) });
      dispatch({ type: 'setCompareSlots', slots: [baselineId, saved.id] });
      dispatch({ type: 'setTab', tab: 'compare' });
      dismissOptimizer();
    },
    [
      optimizer.result,
      optimizer.searched,
      state.scenarioId,
      state.strategy,
      variants.data,
      saveVariant,
      searchedConfig,
      optimizedConfig,
      dispatch,
      dismissOptimizer,
      t,
    ],
  );

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

    // Rings that have not launched yet are drawn faintly rather than hidden:
    // the campaign is easier to read when what is coming is visible, and a
    // ghost ring with no satellites on it cannot be mistaken for one in orbit.
    return scenario.design.planes
      .map((plane) => ({
        planeId: plane.id,
        pending: planeCommitStage(scenario, plane.id) > launchStage,
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
            layout={!panel.resizing}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panel.layoutWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            // A drag is a direct manipulation: the edge belongs under the
            // pointer, not a beat behind it. The spring is what opening and
            // closing the panel is worth, and nothing else.
            transition={panel.resizing ? { duration: 0 } : SPRING}
            className="relative hidden min-h-0 flex-shrink-0 flex-col overflow-hidden border-l border-rule bg-black lg:flex"
          >
            <div className="flex min-h-0 flex-1 flex-col" style={{ width: panel.layoutWidth }}>
              <div className="flex flex-shrink-0 items-start justify-between border-b border-rule px-3 pb-2.5 pt-3">
                <div className="min-w-0">
                  <div className="font-label text-[11px] text-zinc-500">{t('scenario.label')}</div>
                  <div className="truncate font-data text-[13px] text-zinc-100">
                    {scenario?.meta.id ?? '—'}
                  </div>
                  {activeSummary &&
                    (renameDraft !== null ? (
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') submitRename();
                            if (event.key === 'Escape') setRenameDraft(null);
                          }}
                          onBlur={submitRename}
                          maxLength={256}
                          className="min-w-0 flex-1 border border-rule-strong bg-black px-1.5 py-0.5 font-label text-[11px] text-zinc-200 focus-visible:border-zinc-400 focus-visible:outline-none"
                        />
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={submitRename}
                          aria-label={t('scenario.renameSave')}
                          className="flex-shrink-0 text-zinc-500 transition-colors hover:text-zinc-200"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setRenameDraft(null)}
                          aria-label={t('scenario.renameCancel')}
                          className="flex-shrink-0 text-zinc-600 transition-colors hover:text-zinc-200"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate font-label text-[11px] text-zinc-500">
                          {activeSummary.title}
                        </span>
                        {activeSummary.source !== 'official' && (
                          <button
                            type="button"
                            onClick={() => setRenameDraft(activeSummary.title)}
                            aria-label={t('scenario.rename')}
                            className="flex-shrink-0 text-zinc-600 transition-colors hover:text-zinc-200"
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                      </div>
                    ))}
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

  // What planning the launch on screen would cost at each depth. Quoted before
  // the button is pressed, in full days simulated and in minutes on the server.
  const planningLocks = locksForPlanning(scenario, state.committedStages, launchStage);
  const findCosts = {
    quick: { runs: gridSize(planningLocks, 'quick'), seconds: estimateSeconds(gridSize(planningLocks, 'quick')) },
    standard: {
      runs: gridSize(planningLocks, 'standard'),
      seconds: estimateSeconds(gridSize(planningLocks, 'standard')),
    },
  };

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
      runInput={runInput}
      planning={optimizer.running || optimizer.start.isPending}
      onPlanFrom={planFromStage}
      onOpenDeploymentPlan={() => setPlanOpen(true)}
      depth={depth}
      onDepthChange={setDepth}
      findCosts={findCosts}
    />
  );

  const resilienceBody = (
    <CriticalNodes
      resilience={resilience.data}
      loading={resilience.isLoading}
      error={resilience.error}
      colors={colors}
      runInput={runInput}
      scenario={scenario}
      onFailForDay={failForDay}
      onOpenSearch={() => {
        dispatch({ type: 'setTab', tab: 'simulation' });
        setPlanOpen(true);
      }}
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
            <div className="relative min-h-0 flex-1" data-tour="globe">
              <Viewport
                satellites={visibleSatellites}
                links={links}
                clients={clients}
                gateways={gateways}
                routes={state.tab === 'simulation' ? routeTraces : []}
                focusClientId={focusClientId}
                orbits={orbits}
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
                <>
                  {/* The card goes the way the sidebar goes, off its own edge,
                      and leaves the same kind of handle behind. */}
                  <AnimatePresence initial={false}>
                    {!panels.healthHidden && (
                      <motion.div
                        key="health"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="pointer-events-none absolute inset-0 z-10"
                      >
                        <NetworkHealth
                          clients={summary?.clients ?? []}
                          traces={routeTraces}
                          selectedClientId={focusClientId}
                          onSelectClient={selectClient}
                          stale={settling || simulation.isFetching || snapshot.isFetching}
                          onHide={panels.hideHealth}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {panels.healthHidden && (
                      <motion.button
                        type="button"
                        onClick={panels.showHealth}
                        aria-label={t('health.show')}
                        title={t('health.show')}
                        initial={{ opacity: 0, scale: 0.92, x: -10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.92, x: -10 }}
                        className="absolute left-3 top-3 z-20 flex h-7 w-7 items-center justify-center border border-rule-strong bg-black/85 text-zinc-500 backdrop-blur transition-colors hover:border-zinc-600 hover:text-zinc-100 lg:left-6 lg:top-6"
                      >
                        <PanelLeftOpen size={16} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </>
              )}

              {state.tab === 'resilience' && (
                <ResilienceSummary
                  scenario={scenario}
                  resilience={resilience.data}
                  loading={resilience.isLoading || resilience.isFetching}
                />
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
              // The strip keeps step with the data column: one scale for the
              // two frames around the map, so neither reads as the odd one.
              <div ref={playbackRef} data-tour="timeline" style={{ zoom: panel.scale }}>
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
                resetNonce={state.resetNonce}
                onToggle={playback.toggle}
                onSpeed={playback.setSpeed}
                onSeek={playback.seek}
                onSelectClient={selectClient}
                onScheduleOutage={scheduleOutage}
                onClearOutages={clearOutagesIn}
              />
              </div>
            )}
          </motion.div>

          {/* Zoom rather than a second set of sizes: the whole subtree — type,
              rules, spacing and the detail panel that slides out of it — draws
              at one scale, and the layout stays the one that was designed. */}
          <div
            className={cn('relative hidden lg:flex', !panels.hidden && 'flex-shrink-0')}
            style={{
              zoom: panel.scale,
              width: panels.hidden ? 0 : panel.layoutWidth,
            }}
          >
            {!panels.hidden && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('panel.resize')}
                title={t('panel.resize')}
                onPointerDown={(event) => {
                  event.preventDefault();
                  panel.startResize();
                }}
                onDoubleClick={panel.reset}
                className={cn(
                  'absolute inset-y-0 -left-[3px] z-30 w-[5px] cursor-col-resize transition-colors',
                  panel.resizing ? 'bg-zinc-500' : 'hover:bg-zinc-700',
                )}
              />
            )}

            {dataColumn(state.tab, state.tab === 'resilience' ? resilienceBody : configBody)}

            <AnimatePresence initial={false}>
              {planOpen && !panels.hidden && state.tab === 'simulation' && (
                <DeploymentPlan
                  scenario={scenario}
                  runInput={runInput}
                  colors={colors}
                  planning={optimizer.running || optimizer.start.isPending}
                  onPlanFrom={planFromStage}
                  onClose={() => setPlanOpen(false)}
                />
              )}
            </AnimatePresence>

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
                searchedConfig={searchedConfig()}
                colors={colors}
                applied={optimizerApplied}
                scoredAtStage={planScoredAt}
                saving={saveVariant.isPending}
                onApply={applyOptimizerResult}
                onSaveAndCompare={saveOptimizerResult}
                onDismiss={dismissOptimizer}
              />
            ) : (
              <OptimizerProgress
                status={optimizer.status}
                remainingS={optimizer.remainingS}
                onStop={optimizer.stop}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <TourOverlay />
    </div>
  );
}
