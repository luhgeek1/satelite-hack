import React, { useState, useEffect } from 'react';
import { Play, Pause, Upload, ShieldAlert, BarChart3, ChevronDown, AlertTriangle, Plus, X, Zap, Activity, PanelRightClose, PanelRightOpen, Globe as GlobeIcon } from 'lucide-react';
import { Globe, planeColors, type GlobeCameraPosition, type OrbitTrack } from './components/Globe';
import { criticalityLevel } from './lib/criticality';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import { useMediaQuery } from './hooks/useMediaQuery';
import { motion, AnimatePresence } from 'motion/react';
import {
  initialSatellites,
  initialLinks,
  groundStations,
  gateways,
  activeRouteC65,
  baselineMetrics,
  failureMetrics,
  optimizedMetrics,
  orbitTrackPoint
} from './mockData';
import { Satellite, NetworkMetrics, Plane } from './types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

const planeIds: Plane[] = ['P1', 'P2', 'P3'];
const normalizeLongitude = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
const appStateStorageKey = 'orbitguard-ui-state-v1';
// TODO(BACKEND): Load the active scenario's plane configuration from the backend.
const defaultPlanesConfig: Record<Plane, { raan: number; phase: number }> = {
  P1: { raan: 0, phase: 0 },
  P2: { raan: 60, phase: 7.5 },
  P3: { raan: 120, phase: 15 }
};

/** Below this width the data column turns into an overlay drawer. */
const desktopQuery = '(min-width: 1024px)';
const wideDesktopQuery = '(min-width: 1280px)';
const ultraDesktopQuery = '(min-width: 1536px)';

type ConfigGroupId = 'deployment' | 'planes' | 'failures' | 'satellites' | 'sites';

/** Inputs the engineer edits come first; the read-only catalogs sit below. */
const defaultOpenGroups: Record<ConfigGroupId, boolean> = {
  deployment: true,
  planes: true,
  failures: true,
  satellites: false,
  sites: false
};

type AppTab = 'simulation' | 'resilience' | 'compare';
type OptimizationState = 'none' | 'running' | 'done';
/** The single right-hand column, shown as a drawer below `lg`. */
type MobilePanel = 'data' | null;
type PersistedAppState = {
  activeTab: AppTab;
  time: number;
  playing: boolean;
  speed: number;
  satellites: Satellite[];
  metrics: NetworkMetrics;
  activeRoute: string[];
  selectedSatellite: string | null;
  optimizationState: OptimizationState;
  deploymentStage: 1 | 2 | 3;
  showFailureSelect: boolean;
  openGroups: Record<ConfigGroupId, boolean>;
  networkHealthExpanded: boolean;
  leftSidebarHidden: boolean;
  dataPanelHidden: boolean;
  planesConfig: Record<Plane, { raan: number; phase: number }>;
  globeCameraPosition: GlobeCameraPosition | null;
};

const isTab = (value: unknown): value is AppTab =>
  value === 'simulation' || value === 'resilience' || value === 'compare';

const isDeploymentStage = (value: unknown): value is 1 | 2 | 3 =>
  value === 1 || value === 2 || value === 3;

const isOptimizationState = (value: unknown): value is OptimizationState =>
  value === 'none' || value === 'running' || value === 'done';

const isGlobeCameraPosition = (value: unknown): value is GlobeCameraPosition => {
  if (!value || typeof value !== 'object') return false;
  const position = value as GlobeCameraPosition;
  return Number.isFinite(position.lat)
    && Number.isFinite(position.lng)
    && Number.isFinite(position.altitude)
    && position.lat >= -90
    && position.lat <= 90
    && position.lng >= -180
    && position.lng <= 180
    && position.altitude > 0;
};

const loadPersistedAppState = (): Partial<PersistedAppState> => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(appStateStorageKey);
    if (!raw) return {};

    const saved = JSON.parse(raw) as Partial<PersistedAppState>;
    return {
      activeTab: isTab(saved.activeTab) ? saved.activeTab : undefined,
      time: typeof saved.time === 'number' ? saved.time : undefined,
      playing: typeof saved.playing === 'boolean' ? saved.playing : undefined,
      speed: typeof saved.speed === 'number' ? saved.speed : undefined,
      satellites: Array.isArray(saved.satellites) ? saved.satellites : undefined,
      metrics: saved.metrics,
      activeRoute: Array.isArray(saved.activeRoute) ? saved.activeRoute : undefined,
      selectedSatellite: typeof saved.selectedSatellite === 'string' || saved.selectedSatellite === null ? saved.selectedSatellite : undefined,
      optimizationState: isOptimizationState(saved.optimizationState) ? saved.optimizationState : undefined,
      deploymentStage: isDeploymentStage(saved.deploymentStage) ? saved.deploymentStage : undefined,
      showFailureSelect: typeof saved.showFailureSelect === 'boolean' ? saved.showFailureSelect : undefined,
      openGroups: saved.openGroups ? { ...defaultOpenGroups, ...saved.openGroups } : undefined,
      networkHealthExpanded: typeof saved.networkHealthExpanded === 'boolean' ? saved.networkHealthExpanded : undefined,
      leftSidebarHidden: typeof saved.leftSidebarHidden === 'boolean' ? saved.leftSidebarHidden : undefined,
      dataPanelHidden: typeof saved.dataPanelHidden === 'boolean' ? saved.dataPanelHidden : undefined,
      planesConfig: saved.planesConfig ? { ...defaultPlanesConfig, ...saved.planesConfig } : undefined,
      globeCameraPosition: isGlobeCameraPosition(saved.globeCameraPosition) ? saved.globeCameraPosition : undefined,
    };
  } catch {
    return {};
  }
};

const persistedAppState = loadPersistedAppState();

const tabMeta: { id: AppTab; label: string; icon: typeof GlobeIcon }[] = [
  { id: 'simulation', label: 'Simulation', icon: GlobeIcon },
  { id: 'resilience', label: 'Resilience', icon: ShieldAlert },
  { id: 'compare', label: 'Compare', icon: BarChart3 },
];

/**
 * Every group in the configuration column shares one header grammar: name,
 * current value, chevron. The value stays visible when the group is collapsed,
 * so the column reads as a summary of the scenario rather than a stack of lids.
 */
const ConfigGroup: React.FC<{
  title: string;
  value: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, value, open, onToggle, children }) => (
  <section className="border-t border-zinc-800/80 first:border-t-0">
    <h3>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded py-2.5 text-left transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      >
        <span className="text-[13px] text-zinc-300">{title}</span>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-zinc-500">{value}</span>
        <ChevronDown
          size={14}
          className={cn("flex-shrink-0 text-zinc-600 transition-transform duration-200", !open && "-rotate-90")}
        />
      </button>
    </h3>

    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="min-h-0 overflow-hidden"
        >
          <div className="pb-4">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </section>
);

const sidebarButtonClass =
  "hidden h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-black/80 text-zinc-400 backdrop-blur transition-colors hover:border-zinc-600 hover:text-zinc-100 lg:flex";
const sidebarTransition = { type: 'spring', stiffness: 360, damping: 36, mass: 0.9 } as const;

const SidebarEdgeButton: React.FC<{
  label: string;
  onClick: () => void;
}> = ({ label, onClick }) => (
  <motion.button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={cn(sidebarButtonClass, "absolute right-3 top-3 z-30")}
    initial={{ opacity: 0, scale: 0.92, x: 10 }}
    animate={{ opacity: 1, scale: 1, x: 0 }}
    exit={{ opacity: 0, scale: 0.92, x: 10 }}
    transition={{ duration: 0.16, ease: 'easeOut' }}
    whileHover={{ scale: 1.04 }}
    whileTap={{ scale: 0.96 }}
  >
    <PanelRightOpen size={16} />
  </motion.button>
);

/** Slide-over version of the data column, used below `lg`. */
const MobileDrawer: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, onClose, children }) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        />
        <motion.aside
          key="drawer"
          className="fixed top-0 bottom-0 right-0 z-50 flex w-[88vw] max-w-sm flex-col border-l border-zinc-800 bg-[black] lg:hidden"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="text-xs font-semibold tracking-widest text-zinc-400">{title}</span>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Close panel">
              <X size={18} />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
        </motion.aside>
      </>
    )}
  </AnimatePresence>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(persistedAppState.activeTab ?? 'simulation');
  const [time, setTime] = useState(persistedAppState.time ?? 402); // 06:42 in minutes
  const [playing, setPlaying] = useState(persistedAppState.playing ?? false);
  const [speed, setSpeed] = useState(persistedAppState.speed ?? 1);

  const [satellites, setSatellites] = useState<Satellite[]>(persistedAppState.satellites ?? initialSatellites);
  const [links, setLinks] = useState(initialLinks);
  const [metrics, setMetrics] = useState<NetworkMetrics>(persistedAppState.metrics ?? baselineMetrics);
  const [activeRoute, setActiveRoute] = useState<string[]>(persistedAppState.activeRoute ?? activeRouteC65.path);

  const [selectedSatellite, setSelectedSatellite] = useState<string | null>(persistedAppState.selectedSatellite ?? null);
  const [simulating, setSimulating] = useState(false);
  const [optimizationState, setOptimizationState] = useState<OptimizationState>(persistedAppState.optimizationState ?? 'none');

  const [deploymentStage, setDeploymentStage] = useState<1 | 2 | 3>(persistedAppState.deploymentStage ?? 3);
  const [showFailureSelect, setShowFailureSelect] = useState(persistedAppState.showFailureSelect ?? false);
  const [openGroups, setOpenGroups] = useState<Record<ConfigGroupId, boolean>>(
    persistedAppState.openGroups ?? defaultOpenGroups
  );
  const toggleGroup = (group: ConfigGroupId) =>
    setOpenGroups(current => ({ ...current, [group]: !current[group] }));
  const [networkHealthExpanded, setNetworkHealthExpanded] = useState(persistedAppState.networkHealthExpanded ?? true);
  const [leftSidebarHidden, setLeftSidebarHidden] = useState(persistedAppState.leftSidebarHidden ?? false);
  const [dataPanelHidden, setDataPanelHidden] = useState(persistedAppState.dataPanelHidden ?? false);
  const [globeCameraPosition, setGlobeCameraPosition] = useState<GlobeCameraPosition | null>(
    persistedAppState.globeCameraPosition ?? null
  );
  const [planesConfig, setPlanesConfig] = useState<Record<Plane, { raan: number; phase: number }>>(
    persistedAppState.planesConfig ?? defaultPlanesConfig
  );

  const isDesktop = useMediaQuery(desktopQuery);
  const isWideDesktop = useMediaQuery(wideDesktopQuery);
  const isUltraDesktop = useMediaQuery(ultraDesktopQuery);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);

  // TODO(BACKEND): Replace the deterministic visual propagation with current
  // ephemeris or simulation positions returned by the backend.
  const dynamicSatellites = React.useMemo(() => {
    // 16 sats per stage
    const activeCount = deploymentStage * 16;
    let visibleSats = satellites.slice(0, activeCount);

    // Temporary visual approximation; not physical orbital propagation.
    const timeShift = (time * 0.25) % 360;

    return visibleSats.map(sat => {
      const planeRaan = planesConfig[sat.plane]?.raan || 0;
      const planePhase = planesConfig[sat.plane]?.phase;

      // Phase slides a satellite along its own track, so latitude has to be
      // recomputed from the track — shifting longitude alone would lift the
      // whole plane off its orbit line.
      if (sat.slotDeg !== undefined && planePhase !== undefined) {
        const track = orbitTrackPoint(sat.slotDeg + planePhase);
        return {
          ...sat,
          lat: track.lat,
          lon: normalizeLongitude(track.lon + timeShift + planeRaan),
        };
      }

      return {
        ...sat,
        lon: normalizeLongitude(sat.lon + timeShift + planeRaan),
      };
    });
  }, [satellites, time, deploymentStage, planesConfig]);

  /**
   * TODO(BACKEND): Build tracks from orbital elements/ephemeris supplied by the API.
   * Orbit line per deployed plane, traced from the same ground-track curve the
   * satellites are seeded from, then shifted by the same time/RAAN offset — so
   * every satellite of a plane sits exactly on its own line.
   */
  const orbitTracks = React.useMemo<OrbitTrack[]>(() => {
    const timeShift = (time * 0.25) % 360;
    const deployedPlanes = new Set(dynamicSatellites.map(sat => sat.plane));

    return planeIds.filter(plane => deployedPlanes.has(plane)).map(plane => {
      const planeRaan = planesConfig[plane]?.raan || 0;
      const points = [];

      for (let angle = 0; angle <= 360; angle += 3) {
        const track = orbitTrackPoint(angle);
        points.push({ lat: track.lat, lng: track.lon + timeShift + planeRaan });
      }

      return { plane, points };
    });
  }, [dynamicSatellites, time, planesConfig]);

  // Adjust links dynamically if they depend on shifting satellites
  // (Assuming links are static for this demo or we just rely on Globe mapping)

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (playing) {
      interval = setInterval(() => {
        setTime(t => (t + speed) % 1440);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [playing, speed]);

  useEffect(() => {
    const state: PersistedAppState = {
      activeTab,
      time,
      playing,
      speed,
      satellites,
      metrics,
      activeRoute,
      selectedSatellite,
      optimizationState,
      deploymentStage,
      showFailureSelect,
      openGroups,
      networkHealthExpanded,
      leftSidebarHidden,
      dataPanelHidden,
      planesConfig,
      globeCameraPosition,
    };

    window.localStorage.setItem(appStateStorageKey, JSON.stringify(state));
  }, [
    activeTab,
    time,
    playing,
    speed,
    satellites,
    metrics,
    activeRoute,
    selectedSatellite,
    optimizationState,
    deploymentStage,
    showFailureSelect,
    openGroups,
    networkHealthExpanded,
    leftSidebarHidden,
    dataPanelHidden,
    planesConfig,
    globeCameraPosition,
  ]);

  useEffect(() => {
    if (optimizationState !== 'running') return;

    // TODO(BACKEND): Poll or subscribe to an optimizer job instead of timing it locally.
    const timeout = setTimeout(() => {
      setOptimizationState('done');
    }, 2000);

    return () => clearTimeout(timeout);
  }, [optimizationState]);

  // The sidebars are always visible on desktop, so the drawers must not linger.
  useEffect(() => {
    if (isDesktop) setMobilePanel(null);
  }, [isDesktop]);

  // Switching tabs should never leave a drawer from the previous tab open.
  useEffect(() => {
    setMobilePanel(null);
  }, [activeTab]);

  // On narrow screens the satellite detail lives inside the right drawer.
  const selectSatellite = (id: string | null) => {
    setSelectedSatellite(current => current === id ? null : id);
    if (id && !isDesktop) setMobilePanel('data');
  };

  const handleSimulateFailure = (id: string) => {
    setSatellites(sats => sats.map(s => s.id === id ? { ...s, status: 'failed' } : s));
    setSelectedSatellite(null);
    setSimulating(true);

    // TODO(BACKEND): Submit a failure scenario and use its returned progress,
    // topology, route and metrics instead of locally mutating fixture state.
    setTimeout(() => {
      setSimulating(false);
      setMetrics(failureMetrics);
      // Remove failed satellite from active route
      if (activeRoute.includes(id)) {
        setActiveRoute([]);
      }
    }, 1200);
  };

  const handleOptimize = () => {
    setOptimizationState('running');
  };

  const timelineRef = React.useRef<HTMLDivElement>(null);

  /** Maps a pointer position on the timeline track to a minute of the day. */
  const seekFromClientX = (clientX: number) => {
    const track = timelineRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setTime(Math.round(ratio * 1439));
  };

  const handleTimelinePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX);
  };

  const handleTimelinePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    // Only scrub while the pointer is held down.
    if (event.buttons !== 1) return;
    seekFromClientX(event.clientX);
  };

  const handleTimelineKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 60 : 15;
    const nudge = (delta: number) => {
      event.preventDefault();
      setTime(current => Math.min(1439, Math.max(0, Math.round(current) + delta)));
    };

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nudge(-step);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nudge(step);
    else if (event.key === 'Home') { event.preventDefault(); setTime(0); }
    else if (event.key === 'End') { event.preventDefault(); setTime(1439); }
  };

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = Math.floor(minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // --- Panel bodies (shared between desktop sidebars and mobile drawers) ---

  const renderConfigSection = () => {
    const deployedCount = deploymentStage * 16;
    const failedSatellites = satellites.filter(sat => sat.status === 'failed');
    const allSites = [...gateways, ...groundStations];

    return (
      <div className="flex flex-col">
        <ConfigGroup
          title="Deployment"
          value={`${deployedCount} sats`}
          open={openGroups.deployment}
          onToggle={() => toggleGroup('deployment')}
        >
          {/* Stages are cumulative, so they read as a progress track rather than
              three independent options. */}
          <div className="relative flex items-center justify-between px-1">
            <div className="absolute left-1 right-1 top-1/2 h-px -translate-y-1/2 bg-zinc-800" />
            <div
              className="absolute left-1 top-1/2 h-px -translate-y-1/2 bg-blue-500/70 transition-all duration-200"
              style={{ width: `calc((100% - 0.5rem) * ${(deploymentStage - 1) / 2})` }}
            />
            {([1, 2, 3] as const).map(stage => (
              <button
                key={stage}
                type="button"
                onClick={() => setDeploymentStage(stage)}
                aria-pressed={deploymentStage === stage}
                aria-label={`Deploy stage ${stage}, ${stage * 16} satellites`}
                className={cn(
                  "relative flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500",
                  deploymentStage === stage
                    ? "border-blue-500 bg-blue-500/15 font-semibold text-blue-300"
                    : deploymentStage > stage
                      ? "border-blue-500/60 bg-[black] text-blue-400/80"
                      : "border-zinc-700 bg-[black] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                )}
              >
                {stage}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between px-1 font-mono text-[10px] tabular-nums">
            {[16, 32, 48].map((count, index) => (
              <span key={count} className={deploymentStage >= index + 1 ? "text-blue-400" : "text-zinc-600"}>
                {count}
              </span>
            ))}
          </div>
        </ConfigGroup>

        <ConfigGroup
          title="Orbital planes"
          value={planeIds.map(plane => `${planesConfig[plane].raan}°`).join('  ')}
          open={openGroups.planes}
          onToggle={() => toggleGroup('planes')}
        >
          <div className="space-y-4">
            {planeIds.map(plane => (
              <div key={plane}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-[3px] rounded-full" style={{ background: planeColors[plane] }} />
                  <span className="text-[13px] text-zinc-200">Plane {plane}</span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500">
                    {satellites.filter(sat => sat.plane === plane).length} sats
                  </span>
                </div>

                <div className="mt-2 space-y-2.5">
                  {([
                    { key: 'raan' as const, label: 'RAAN', max: 360, step: 1 },
                    { key: 'phase' as const, label: 'Phase', max: 22.5, step: 0.5 }
                  ]).map(control => (
                    <div key={control.key}>
                      <div className="flex items-baseline justify-between">
                        <label htmlFor={`${plane}-${control.key}`} className="text-[11px] text-zinc-500">
                          {control.label}
                        </label>
                        <span className="font-mono text-[11px] tabular-nums text-zinc-300">
                          {planesConfig[plane][control.key]}°
                        </span>
                      </div>
                      <input
                        id={`${plane}-${control.key}`}
                        type="range"
                        min={0}
                        max={control.max}
                        step={control.step}
                        value={planesConfig[plane][control.key]}
                        onChange={event => setPlanesConfig(prev => ({
                          ...prev,
                          [plane]: { ...prev[plane], [control.key]: parseFloat(event.target.value) }
                        }))}
                        style={{ accentColor: planeColors[plane] }}
                        className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ConfigGroup>

        <ConfigGroup
          title="Failures"
          value={failedSatellites.length ? `${failedSatellites.length} down` : 'none'}
          open={openGroups.failures}
          onToggle={() => toggleGroup('failures')}
        >
          <div className="space-y-2">
            {failedSatellites.map(satellite => (
              <div
                key={satellite.id}
                className="flex items-center gap-2 rounded border border-red-500/25 bg-red-500/10 px-2 py-1.5"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span className="font-mono text-xs text-red-300">{satellite.id}</span>
                <button
                  type="button"
                  className="ml-auto text-[11px] text-zinc-400 transition-colors hover:text-zinc-100"
                  onClick={() => {
                    // TODO(BACKEND): Restore the node through the scenario API.
                    setSatellites(sats => sats.map(sat => sat.id === satellite.id ? { ...sat, status: 'active' } : sat));
                    setMetrics(baselineMetrics);
                    setActiveRoute(activeRouteC65.path);
                  }}
                >
                  Restore
                </button>
              </div>
            ))}

            {!failedSatellites.length && !showFailureSelect && (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Every node is up. Add a failure to see how the network copes.
              </p>
            )}

            {showFailureSelect ? (
              <div className="space-y-2 rounded border border-zinc-800 bg-zinc-900/50 p-2">
                <label htmlFor="failure-target" className="block text-[11px] text-zinc-400">
                  Which satellite fails?
                </label>
                <select
                  id="failure-target"
                  autoFocus
                  className="w-full rounded border border-zinc-700 bg-zinc-950 p-1.5 font-mono text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                  onChange={event => {
                    if (event.target.value) handleSimulateFailure(event.target.value);
                    setShowFailureSelect(false);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Choose a satellite</option>
                  {dynamicSatellites.filter(sat => sat.status === 'active').map(sat => (
                    <option key={sat.id} value={sat.id}>{sat.id} · plane {sat.plane}</option>
                  ))}
                </select>
                <Button variant="ghost" size="sm" className="h-7 w-full text-[11px]" onClick={() => setShowFailureSelect(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full text-xs"
                onClick={() => setShowFailureSelect(true)}
              >
                <Plus size={14} className="mr-1.5" /> Add failure
              </Button>
            )}

          </div>
        </ConfigGroup>

        <ConfigGroup
          title="Satellites"
          value={`${deployedCount} of ${satellites.length}`}
          open={openGroups.satellites}
          onToggle={() => toggleGroup('satellites')}
        >
          <div className="max-h-[clamp(9rem,24vh,17rem)] space-y-px overflow-y-auto overscroll-contain pr-1">
            {satellites.map((satellite, index) => {
              const isDeployed = index < deployedCount;
              const isSelected = selectedSatellite === satellite.id;

              return (
                <button
                  key={satellite.id}
                  type="button"
                  onClick={() => selectSatellite(satellite.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500",
                    isSelected ? "bg-zinc-800/80" : "hover:bg-zinc-900",
                    !isDeployed && "opacity-45"
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: satellite.status === 'failed' ? '#ef4444' : planeColors[satellite.plane] }}
                  />
                  <span className="font-mono text-xs text-zinc-200">{satellite.id}</span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500">{satellite.plane}</span>
                </button>
              );
            })}
          </div>
        </ConfigGroup>

        <ConfigGroup
          title="Ground sites"
          value={`${allSites.length}`}
          open={openGroups.sites}
          onToggle={() => toggleGroup('sites')}
        >
          <div className="space-y-px">
            {allSites.map(site => {
              const isGateway = site.role === 'gateway';
              return (
                <div key={site.id} className="flex items-start gap-2 rounded px-2 py-1.5">
                  <span className={cn(
                    "mt-1 h-2 w-2 shrink-0",
                    isGateway
                      ? "rotate-45 bg-amber-400"
                      : "border-l-4 border-r-4 border-b-[7px] border-l-transparent border-r-transparent border-b-blue-400"
                  )} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={cn("font-mono text-xs", isGateway ? "text-amber-300" : "text-blue-300")}>
                        {site.id}
                      </span>
                      <span className="truncate text-[11px] text-zinc-400">{site.name}</span>
                    </div>
                    <div className="font-mono text-[10px] tabular-nums text-zinc-500">
                      {formatLatitude(site.lat)}  {formatLongitude(site.lon)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ConfigGroup>
      </div>
    );
  };

  /** Latitude/longitude the way an engineer reads them, not as signed floats. */
  const formatLatitude = (lat: number) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const formatLongitude = (lon: number) => `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;

  /**
   * Compact network-health HUD pinned to the top-left corner of the globe.
   * The body stays click-through so it never blocks globe dragging; only the
   * collapse header takes pointer events.
   */
  const renderNetworkHealthCard = () => {
    const hasRoute = activeRoute.length > 0;

    return (
      <div className="pointer-events-none absolute left-3 top-3 z-10 w-[190px] rounded-lg border border-zinc-800 bg-black/70 p-3 backdrop-blur sm:w-[215px] lg:left-6 lg:top-6 lg:p-4">
        <button
          type="button"
          onClick={() => setNetworkHealthExpanded(expanded => !expanded)}
          className="pointer-events-auto flex w-full items-center gap-2 rounded-md text-left transition-colors hover:text-blue-300"
          aria-expanded={networkHealthExpanded}
          title={networkHealthExpanded ? 'Collapse network health' : 'Expand network health'}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.9)]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-blue-400">Network Health</span>
          <ChevronDown
            size={13}
            className={cn(
              "ml-auto shrink-0 text-blue-400/70 transition-transform duration-200",
              !networkHealthExpanded && "-rotate-90"
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {networkHealthExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="min-h-0 overflow-hidden"
            >
              <div className="mt-3 space-y-1.5 font-mono text-[11px] sm:text-xs">
                {Object.entries(metrics.availability).map(([id, v]) => {
                  const val = v as number;
                  return (
                    <div key={id} className="flex items-baseline justify-between gap-2">
                      <span className="text-zinc-400">{id}</span>
                      <span className={cn(
                        val >= 95 ? "text-zinc-100" : val >= 90 ? "text-amber-400" : "text-red-400"
                      )}>{val.toFixed(1)}%</span>
                    </div>
                  );
                })}
                <div className="flex items-baseline justify-between gap-2 text-zinc-500">
                  <span>Target</span>
                  <span>≥ 90%</span>
                </div>
              </div>

              <div className="my-3 border-t border-zinc-800" />

              <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] sm:text-xs">
                <span className="text-zinc-400">Max outage</span>
                <span className="text-zinc-100">{metrics.maxOutageMinutes} min</span>
              </div>

              <div className="mt-3 font-mono text-[11px] sm:text-xs">
                {hasRoute ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-zinc-400">Route</span>
                      <span className="text-zinc-100">{activeRoute.length - 1} hops</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1 text-emerald-400">
                      {activeRoute.map((node, i) => (
                        <React.Fragment key={i}>
                          <span>{node}</span>
                          {i < activeRoute.length - 1 && <span className="text-zinc-600">→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-red-400">
                    <AlertTriangle size={12} /> No route
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };


  /**
   * Detail view for a clicked satellite, used as a desktop column or mobile
   * overlay. Reads as an instrument panel: the criticality verdict first, then
   * telemetry in one aligned column, then the single action.
   */
  const renderSatelliteOverlay = (placement: 'sidebar' | 'overlay' = 'overlay') => {
    if (!selectedSatellite) return null;

    const sat = satellites.find(s => s.id === selectedSatellite);
    const failed = sat?.status === 'failed';
    const level = sat ? criticalityLevel(sat.criticality) : null;
    const accent = failed ? '#ef4444' : sat ? planeColors[sat.plane] : '#3b82f6';

    // Neighbours come from the real link graph, so the panel answers "what
    // else goes down with it" rather than only restating the orbit fields.
    const neighbours = sat
      ? links
          .filter(link => link.type === 'isl' && (link.source === sat.id || link.target === sat.id))
          .map(link => (link.source === sat.id ? link.target : link.source))
      : [];
    const carriesRoute = sat ? activeRoute.includes(sat.id) : false;
    // Same impact model the critical-nodes list uses, so the two never disagree.
    const availabilityCost = sat ? (sat.criticality / 100) * 16 : 0;

    const telemetry = sat
      ? [
          { label: 'Plane', value: sat.plane, tone: 'text-zinc-200' },
          { label: 'Altitude', value: `${sat.altitude} km`, tone: 'text-zinc-200' },
          { label: 'Latitude', value: formatLatitude(sat.lat), tone: 'text-zinc-200' },
          { label: 'Longitude', value: formatLongitude(sat.lon), tone: 'text-zinc-200' },
          { label: 'Inter-satellite links', value: `${neighbours.length}`, tone: 'text-zinc-200' },
          {
            label: 'Active route',
            value: carriesRoute ? 'Carrying' : 'Not in path',
            tone: carriesRoute ? 'text-blue-400' : 'text-zinc-500'
          }
        ]
      : [];

    const content = (
      <motion.div
            key={placement === 'overlay' ? `${placement}-${selectedSatellite}` : 'sidebar-details'}
            initial={placement === 'overlay' ? { x: '100%' } : false}
            animate={placement === 'overlay' ? { x: 0 } : { opacity: 1 }}
            exit={placement === 'overlay' ? { x: '100%' } : { opacity: 1 }}
            transition={{ type: "spring", damping: 20, stiffness: 200 }}
            className={cn(
              "flex h-fit flex-col overflow-y-auto overscroll-contain bg-[#09090b] p-4",
              placement === 'overlay' && "absolute inset-x-0 top-0 z-20 max-h-full border-l border-zinc-700 shadow-2xl"
            )}
          >
            {sat && level && (
              <>
                <div className="flex items-center gap-3">
                  <span className="h-9 w-[3px] flex-shrink-0 rounded-full" style={{ background: accent }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xl leading-none text-zinc-50">{sat.id}</div>
                    <div className={cn("mt-1.5 text-[11px]", failed ? "text-red-400" : "text-zinc-400")}>
                      {failed ? 'Failed' : 'Active'}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedSatellite(null)}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-200"
                    aria-label="Close satellite details"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="mt-5">
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex items-baseline gap-1">
                      <span
                        className="font-mono text-[40px] leading-none tracking-tight tabular-nums"
                        style={{ color: level.color }}
                      >
                        {sat.criticality}
                      </span>
                      <span className="font-mono text-sm text-zinc-600">/100</span>
                    </div>
                    <div className="text-right leading-tight">
                      <div className="text-[11px] text-zinc-500">Criticality</div>
                      <div className="text-[11px]" style={{ color: level.color }}>{level.label}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-[2px]" aria-hidden="true">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <span
                        key={i}
                        className="h-3 flex-1 rounded-[1px]"
                        style={{
                          background: ((i + 1) / 24) * 100 <= sat.criticality ? level.color : '#27272a'
                        }}
                      />
                    ))}
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                    {failed
                      ? 'This node is down. Links through it are cut until you restore it.'
                      : `Losing this node costs about ${availabilityCost.toFixed(1)}% availability.`}
                  </p>
                </div>

                <dl className="mt-5 border-t border-zinc-800/80">
                  {telemetry.map(row => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-4 border-b border-zinc-800/80 py-2"
                    >
                      <dt className="text-xs text-zinc-500">{row.label}</dt>
                      <dd className={cn("font-mono text-[13px] tabular-nums", row.tone)}>{row.value}</dd>
                    </div>
                  ))}
                </dl>

                {neighbours.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs text-zinc-500">Connects to</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {neighbours.map(id => (
                        <button
                          key={id}
                          onClick={() => setSelectedSatellite(id)}
                          className="rounded border border-zinc-800 bg-zinc-900/70 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6">
                  {failed ? (
                    <Button variant="outline" className="w-full" onClick={() => {
                      setSatellites(sats => sats.map(s => s.id === sat.id ? { ...s, status: 'active' } : s));
                      setSelectedSatellite(null);
                      setMetrics(baselineMetrics);
                      setActiveRoute(activeRouteC65.path);
                    }}>
                      Restore node
                    </Button>
                  ) : (
                    <Button variant="danger" className="w-full" onClick={() => handleSimulateFailure(sat.id)}>
                      Simulate failure
                    </Button>
                  )}
                </div>
              </>
            )}
      </motion.div>
    );

    return placement === 'overlay' ? <AnimatePresence>{content}</AnimatePresence> : content;
  };

  /** The right-hand column: scenario configuration (health lives on the globe HUD). */
  const renderDataPanel = (includeSatelliteOverlay = false) => (
    <>
      <motion.div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <section className="p-4">
          <h2 className="mb-1 pr-9 text-xs font-semibold tracking-widest text-zinc-400">CONFIGURATION</h2>
          {renderConfigSection()}
        </section>
      </motion.div>

      {/* The primary action stays reachable while the column scrolls. */}
      <div className="flex-shrink-0 border-t border-zinc-800 bg-[#09090b] p-4">
        <Button
          className="h-10 w-full"
          disabled={simulating}
          onClick={() => {
            setSimulating(true);
            // TODO(BACKEND): Run the selected scenario through the simulation API.
            setTimeout(() => setSimulating(false), 1500);
          }}
        >
          {simulating ? (
            <motion.span
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-sm font-medium"
            >
              Simulating…
            </motion.span>
          ) : (
            <span className="flex items-center text-sm font-medium">
              <Play size={14} className="mr-2" /> Run simulation
            </span>
          )}
        </Button>
      </div>

      {includeSatelliteOverlay && renderSatelliteOverlay()}
    </>
  );

  const renderCriticalNodesPanel = () => (
    <>
      <motion.div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 lg:p-6"
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <h2 className="mb-4 hidden pr-9 text-xs font-semibold tracking-widest text-zinc-400 lg:mb-6 lg:block">CRITICAL NODES</h2>

        <div className="space-y-3 lg:space-y-4">
          {[...satellites].sort((a,b) => b.criticality - a.criticality).slice(0,4).map((sat, idx) => (
             <Card
               key={sat.id}
               className={cn(
                 "bg-[black] cursor-pointer hover:border-blue-900 transition-colors",
                 selectedSatellite === sat.id && "border-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
               )}
               onClick={() => selectSatellite(sat.id)}
             >
               <CardContent className="p-4">
                 <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center space-x-2">
                     <span className="text-xs text-zinc-500 font-mono">0{idx+1}</span>
                     <span className="font-medium text-zinc-200">{sat.id}</span>
                   </div>
                   <div className="text-xs font-mono text-orange-400">{sat.criticality}</div>
                 </div>
                 <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-orange-500" style={{ width: `${sat.criticality}%` }} />
                 </div>
                 <div className="flex justify-between text-xs text-zinc-400">
                    <span>Avail. impact</span>
                    <span className="text-red-400 font-mono">-{((sat.criticality / 100) * 16).toFixed(1)}%</span>
                 </div>
               </CardContent>
             </Card>
          ))}
        </div>
      </motion.div>

      <div className="flex-shrink-0 border-t border-zinc-800 p-4 lg:p-6">
        <Button className="w-full py-4 text-sm lg:py-6" onClick={handleOptimize}>
          <Zap size={16} className="mr-2" /> Optimize Configuration
        </Button>
      </div>

      {/* TODO(BACKEND): Replace fixture progress, recommendations and result metrics with optimizer-job data. */}
      <AnimatePresence>
        {optimizationState !== 'none' && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="absolute inset-0 z-30 flex flex-col bg-[#09090b] p-4 lg:p-6"
          >
             {optimizationState === 'running' ? (
               <div className="flex flex-col items-center justify-center flex-1 space-y-6">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  >
                    <Zap size={32} className="text-blue-400" />
                  </motion.div>
                  <div className="text-center space-y-2">
                    <div className="font-mono text-sm tracking-wider text-zinc-300">SEARCHING CONFIGURATIONS</div>
                    <div className="text-xs text-zinc-500">124 / 500 explored</div>
                  </div>
               </div>
             ) : (
               <div className="flex flex-col h-full min-h-0">
                  <h2 className="text-xs font-semibold tracking-widest text-zinc-400 mb-4 lg:mb-6 flex items-center justify-between">
                    RECOMMENDED CONFIGURATION
                    <button onClick={() => setOptimizationState('none')}><X size={16} className="text-zinc-500" /></button>
                  </h2>

                  <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain">
                     <div className="grid grid-cols-2 gap-3 lg:gap-4">
                       <div className="bg-[black] p-3 lg:p-4 rounded-lg border border-zinc-800">
                         <div className="text-xs text-zinc-500 mb-1">Availability</div>
                         <div className="font-mono flex flex-wrap items-end gap-x-2">
                           <span className="text-zinc-400 line-through text-xs mb-0.5">96.7%</span>
                           <span className="text-blue-400 text-lg">98.1%</span>
                         </div>
                       </div>
                       <div className="bg-[black] p-3 lg:p-4 rounded-lg border border-zinc-800">
                         <div className="text-xs text-zinc-500 mb-1">Max Outage</div>
                         <div className="font-mono flex flex-wrap items-end gap-x-2">
                           <span className="text-zinc-400 line-through text-xs mb-0.5">26m</span>
                           <span className="text-blue-400 text-lg">14m</span>
                         </div>
                       </div>
                     </div>

                     <div>
                       <div className="text-xs font-medium text-zinc-400 mb-3">ORBIT CHANGES</div>
                       <div className="space-y-3">
                         <div className="bg-zinc-900/50 p-3 rounded text-sm border border-zinc-800/50">
                            <div className="font-medium mb-2">Plane P2</div>
                            <div className="flex justify-between text-zinc-400 font-mono text-xs">
                              <span>RAAN</span>
                              <span>60° → <span className="text-blue-400">56°</span></span>
                            </div>
                            <div className="flex justify-between text-zinc-400 font-mono text-xs mt-1">
                              <span>Phase</span>
                              <span>7.5° → <span className="text-blue-400">13.0°</span></span>
                            </div>
                         </div>
                         <div className="bg-zinc-900/50 p-3 rounded text-sm border border-zinc-800/50">
                            <div className="font-medium mb-2">Plane P3</div>
                            <div className="flex justify-between text-zinc-400 font-mono text-xs">
                              <span>RAAN</span>
                              <span>120° → <span className="text-blue-400">124°</span></span>
                            </div>
                         </div>
                       </div>
                     </div>
                  </div>

                  <div className="flex-shrink-0 space-y-3 border-t border-zinc-800 pt-4 mt-4 lg:pt-6">
                    <Button className="w-full" onClick={() => {
                      setMetrics(optimizedMetrics);
                      setOptimizationState('none');
                    }}>Apply Configuration</Button>
                    <Button variant="outline" className="w-full" onClick={() => {
                      setOptimizationState('none');
                      setActiveTab('compare');
                    }}>Compare with Baseline</Button>
                  </div>
               </div>
             )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  /** Floating toggle that opens the data column as a drawer below `lg`. */
  const renderMobilePanelToggle = (label: string, icon: React.ReactNode) => (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-3 lg:hidden">
      <button
        onClick={() => setMobilePanel('data')}
        className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-zinc-800 bg-black/80 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 backdrop-blur transition-colors hover:border-zinc-600 hover:text-white"
      >
        {icon} {label}
      </button>
    </div>
  );

  /**
   * The right-hand data column. Roughly a quarter to a third of the width, so
   * the globe keeps the majority of the screen (see the reference layout).
   */
  const dataColumnWidth = isUltraDesktop ? 440 : isWideDesktop ? 390 : 336;
  const satellitePanelWidth = isUltraDesktop ? 320 : 280;

  const renderDataColumn = (key: string, body: React.ReactNode) => (
    <>
      <AnimatePresence initial={false}>
        {!dataPanelHidden && selectedSatellite && (
          <motion.aside
            key={`${key}-satellite-details`}
            className="absolute top-0 z-20 hidden h-auto max-h-full min-w-0 flex-col overflow-y-auto border-l border-zinc-800 bg-[#09090b] shadow-2xl lg:flex"
            style={{
              right: dataColumnWidth,
              width: satellitePanelWidth,
              alignSelf: 'flex-start',
              height: 'auto',
              transformOrigin: 'right top'
            }}
            initial={{ opacity: 0, clipPath: 'inset(0 0 0 100%)' }}
            animate={{ opacity: 1, clipPath: 'inset(0 0 0 0%)' }}
            exit={{ opacity: 0, clipPath: 'inset(0 0 0 100%)' }}
            transition={{
              duration: 0.22,
              ease: 'easeOut'
            }}
          >
            {renderSatelliteOverlay('sidebar')}
          </motion.aside>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {!dataPanelHidden && (
          <motion.aside
            key={`${key}-data-column`}
            layout
            className="relative hidden flex-shrink-0 flex-col overflow-hidden border-l border-zinc-800 bg-[black] lg:flex"
            initial={{ width: 0, opacity: 0, x: 18 }}
            animate={{ width: dataColumnWidth, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: 18 }}
            transition={sidebarTransition}
          >
            <motion.button
              type="button"
              onClick={() => setDataPanelHidden(true)}
              title="Hide data panel"
              aria-label="Hide data panel"
              className={cn(sidebarButtonClass, "absolute right-3 top-3 z-10")}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              <PanelRightClose size={16} />
            </motion.button>
            {body}
          </motion.aside>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {dataPanelHidden && (
          <SidebarEdgeButton label="Show data panel" onClick={() => setDataPanelHidden(false)} />
        )}
      </AnimatePresence>
    </>
  );

  // --- Tabs ---

  const renderSimulationTab = () => (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* Left - Globe + timeline */}
      <motion.div layout transition={sidebarTransition} className="flex min-w-0 flex-1 flex-col bg-[black]">
        <div className="relative min-h-0 flex-1">
          <Globe
            satellites={dynamicSatellites}
            links={links}
            groundStations={groundStations}
            gateways={gateways}
            activeRoute={activeRoute}
            orbits={orbitTracks}
            playing={playing}
            cameraPosition={globeCameraPosition ?? undefined}
            onCameraPositionChange={setGlobeCameraPosition}
            onSatelliteClick={(s) => selectSatellite(s.id)}
            selectedSatellite={selectedSatellite}
          />
          {renderNetworkHealthCard()}
          {renderMobilePanelToggle('Panel', <Activity size={13} />)}
        </div>

        {/* Playback toolbar */}
        <div className="flex-shrink-0 border-t border-zinc-800 bg-[black]/90 px-3 py-2 backdrop-blur sm:px-4">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <button
              type="button"
              onClick={() => setPlaying(!playing)}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <div className="flex flex-shrink-0 items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
              {[1, 4, 16].map(rate => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setSpeed(rate)}
                  aria-pressed={speed === rate}
                  className={cn(
                    "h-6 rounded px-2 font-mono text-[11px] transition-colors",
                    speed === rate
                      ? "bg-zinc-800 text-zinc-100 ring-1 ring-zinc-700"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  x{rate}
                </button>
              ))}
            </div>

            <div className="flex flex-shrink-0 items-baseline gap-1 font-mono text-sm tabular-nums text-blue-400">
              {formatTime(time)}
              <span className="text-[10px] text-zinc-500">UTC</span>
            </div>

            <div className="hidden h-5 w-px flex-shrink-0 bg-zinc-800 sm:block" />

            <div className="flex w-full min-w-0 basis-full items-center gap-2 sm:w-auto sm:flex-1 sm:basis-0">
              <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">00:00</span>

              <div
                ref={timelineRef}
                role="slider"
                tabIndex={0}
                aria-label="Simulation time"
                aria-valuemin={0}
                aria-valuemax={1439}
                aria-valuenow={Math.round(time)}
                aria-valuetext={`${formatTime(time)} UTC`}
                onPointerDown={handleTimelinePointerDown}
                onPointerMove={handleTimelinePointerMove}
                onKeyDown={handleTimelineKeyDown}
                className="group relative h-4 min-w-0 flex-1 cursor-pointer touch-none focus:outline-none"
              >
                <div className="absolute inset-x-0 top-1/2 flex h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-800 ring-offset-2 ring-offset-black group-focus-visible:ring-1 group-focus-visible:ring-blue-500">
                  {activeRoute.length === 0 ? (
                    <div className="h-full w-full bg-red-500/80" />
                  ) : (
                    <>
                      <div className="h-full w-[30%] bg-blue-500/80" />
                      <div className="h-full w-[10%] bg-red-500/80" />
                      <div className="h-full w-[40%] bg-blue-500/80" />
                      <div className="h-full w-[5%] bg-red-500/80" />
                      <div className="h-full w-[15%] bg-blue-500/80" />
                    </>
                  )}
                </div>

                <div
                  className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)] transition-[left] duration-75"
                  style={{ left: `${(time / 1440) * 100}%` }}
                />
              </div>

              <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">24:00</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right - data column (desktop) */}
      {renderDataColumn('simulation', renderDataPanel())}

      {/* Drawer (below lg) */}
      <MobileDrawer open={mobilePanel === 'data'} title="CONFIGURATION" onClose={() => setMobilePanel(null)}>
        {renderDataPanel(true)}
      </MobileDrawer>
    </div>
  );

  const renderResilienceTab = () => (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <motion.div layout transition={sidebarTransition} className="relative flex min-w-0 flex-1 flex-col bg-[black]">
        <Globe
          satellites={satellites}
          links={links}
          groundStations={groundStations}
          gateways={gateways}
          cameraPosition={globeCameraPosition ?? undefined}
          onCameraPositionChange={setGlobeCameraPosition}
          onSatelliteClick={(s) => selectSatellite(s.id)}
          selectedSatellite={selectedSatellite}
          mode="resilience"
        />
        {renderMobilePanelToggle('Critical nodes', <ShieldAlert size={13} />)}
        <div className="absolute bottom-3 left-3 rounded-lg border border-zinc-800 bg-[black]/80 p-3 backdrop-blur lg:top-6 lg:bottom-auto lg:left-6 lg:p-4">
          <div className="mb-2 text-[10px] font-semibold tracking-widest text-zinc-400 lg:mb-3 lg:text-xs">NODE CRITICALITY</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs lg:block lg:space-y-2 lg:text-sm">
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-zinc-500 mr-2" /> Low</div>
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-amber-400 mr-2" /> Medium</div>
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-orange-500 mr-2 shadow-[0_0_8px_rgba(249,115,22,0.8)]" /> High</div>
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-red-500 mr-2 shadow-[0_0_8px_rgba(239,68,68,0.8)]" /> Critical</div>
          </div>
        </div>
      </motion.div>

      {renderDataColumn('resilience', renderCriticalNodesPanel())}

      <MobileDrawer open={mobilePanel === 'data'} title="CRITICAL NODES" onClose={() => setMobilePanel(null)}>
        <>
          {renderCriticalNodesPanel()}
          {renderSatelliteOverlay()}
        </>
      </MobileDrawer>
    </div>
  );

  const renderCompareTab = () => {
    const chartData = Array.from({ length: 25 }).map((_, i) => {
      const hour = i;
      // TODO(BACKEND): Use baseline and optimized time-series returned by simulation.
      const base = 85 + Math.sin(hour * 0.5) * 5 + Math.cos(hour * 0.2) * 5;
      const deterministicLift = 1 + ((hour * 37) % 11) / 10;
      const opt = Math.min(100, base + 4 + deterministicLift);
      return {
        time: `${hour.toString().padStart(2, '0')}:00`,
        baseline: base.toFixed(1),
        optimized: opt.toFixed(1)
      };
    });

    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[black] p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8">

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-zinc-800 bg-[#09090b] p-3">
              <span className="truncate text-sm font-medium">A <span className="text-zinc-500 ml-2">Baseline</span></span>
              <ChevronDown size={14} className="ml-2 flex-shrink-0 text-zinc-500" />
            </div>
            <div className="flex-shrink-0 font-mono text-zinc-600">VS</div>
            <div className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-zinc-800 bg-[#09090b] p-3 ring-1 ring-blue-500/50">
              <span className="truncate text-sm font-medium">B <span className="text-zinc-500 ml-2">Optimized</span></span>
              <ChevronDown size={14} className="ml-2 flex-shrink-0 text-zinc-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            <Card className="bg-[#09090b]">
              <CardHeader><CardTitle>Availability</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500 font-mono">Baseline</div>
                    <div className="text-lg font-mono text-zinc-300">96.7%</div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="text-xs text-zinc-500 font-mono">Optimized</div>
                    <div className="text-2xl font-mono text-blue-400">98.1%</div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-zinc-800/50 text-right text-blue-400 font-mono text-sm">
                  +1.4%
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#09090b]">
              <CardHeader><CardTitle>Max Outage</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500 font-mono">Baseline</div>
                    <div className="text-lg font-mono text-zinc-300">26 min</div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="text-xs text-zinc-500 font-mono">Optimized</div>
                    <div className="text-2xl font-mono text-blue-400">14 min</div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-zinc-800/50 text-right text-blue-400 font-mono text-sm">
                  -46%
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#09090b] sm:col-span-2 lg:col-span-1">
              <CardHeader><CardTitle>Critical Nodes</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500 font-mono">Baseline</div>
                    <div className="text-lg font-mono text-zinc-300">5</div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="text-xs text-zinc-500 font-mono">Optimized</div>
                    <div className="text-2xl font-mono text-blue-400">2</div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-zinc-800/50 text-right text-blue-400 font-mono text-sm">
                  -3 nodes
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-[#09090b] p-4 pb-2 sm:p-6 sm:pb-2">
            <h3 className="mb-4 text-xs font-semibold tracking-widest text-zinc-400 sm:mb-6">AVAILABILITY OVER 24 HOURS</h3>
            <div className="h-48 sm:h-56 lg:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} tickMargin={10} minTickGap={40} />
                  <YAxis domain={[70, 100]} stroke="#475569" fontSize={11} width={38} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px' }}
                    itemStyle={{ fontFamily: 'monospace' }}
                    labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                  />
                  <ReferenceLine y={90} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Target 90%', fill: '#64748b', fontSize: 10 }} />
                  <Line type="monotone" dataKey="baseline" stroke="#64748b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="optimized" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="bg-[#09090b] p-4 sm:p-6">
            <h3 className="mb-4 text-xs font-semibold tracking-widest text-zinc-400 sm:mb-6">OUTAGE TIMELINE COMPARISON</h3>

            <div className="space-y-5 sm:space-y-6">
              <div className="flex items-center">
                <div className="w-20 flex-shrink-0 text-xs text-zinc-400 sm:w-24 sm:text-sm">Baseline</div>
                <div className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-blue-500/20">
                  <div className="w-[10%] bg-blue-500"></div>
                  <div className="w-[5%] bg-red-500"></div>
                  <div className="w-[15%] bg-blue-500"></div>
                  <div className="w-[8%] bg-red-500"></div>
                  <div className="w-[30%] bg-blue-500"></div>
                  <div className="w-[12%] bg-red-500"></div>
                  <div className="w-[20%] bg-blue-500"></div>
                </div>
              </div>

              <div className="flex items-center">
                <div className="w-20 flex-shrink-0 text-xs font-medium text-blue-400 sm:w-24 sm:text-sm">Optimized</div>
                <div className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-blue-500/20">
                  <div className="w-[30%] bg-blue-500"></div>
                  <div className="w-[3%] bg-red-500"></div>
                  <div className="w-[45%] bg-blue-500"></div>
                  <div className="w-[2%] bg-red-500"></div>
                  <div className="w-[20%] bg-blue-500"></div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[black] font-sans text-zinc-300">
      {/* Header */}
      <header className="z-10 grid h-14 flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-zinc-800 bg-[black] px-3 sm:gap-4 sm:px-6 lg:h-16">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-blue-800 bg-gradient-to-tr from-blue-600 to-blue-900">
            <GlobeIcon className="h-5 w-5 text-white" />
          </div>
          <div className="hidden min-w-0 sm:block">
            <h1 className="truncate text-sm font-bold leading-tight tracking-wide text-zinc-100">OrbitGuard</h1>
            <div className="hidden text-[10px] uppercase tracking-widest text-blue-500/80 lg:block">Satellite Resilience Studio</div>
          </div>
        </div>

        <div className="flex h-9 flex-shrink-0 items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          {tabMeta.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              title={label}
              aria-label={label}
              className={cn(
                "flex h-full items-center gap-2 rounded-md px-2.5 text-sm font-medium capitalize transition-colors duration-200 sm:px-4 lg:px-6",
                activeTab === id
                  ? "bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              )}
            >
              <Icon size={14} className="md:hidden" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <div className="hidden h-8 items-center rounded-md border border-zinc-800 bg-zinc-900/60 px-3 text-sm xl:flex">
            <span className="mr-2 text-zinc-500">Scenario:</span>
            <span className="truncate text-zinc-200">01_full_constellation</span>
            <ChevronDown size={14} className="ml-2 flex-shrink-0 text-zinc-500" />
          </div>
          <Button variant="outline" size="sm" className="h-8 flex-shrink-0 px-2.5 sm:px-3" title="Import JSON">
            <Upload size={14} className="sm:mr-2" /> <span className="hidden sm:inline">JSON</span>
          </Button>
          <div className="hidden h-8 flex-shrink-0 items-center rounded-md border border-blue-500/20 bg-blue-400/10 px-2.5 font-mono text-xs text-blue-400 sm:flex">
            <div className="mr-2 h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.9)]" />
            READY
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="flex min-h-0 min-w-0 flex-1"
          >
            {activeTab === 'simulation' && renderSimulationTab()}
            {activeTab === 'resilience' && renderResilienceTab()}
            {activeTab === 'compare' && renderCompareTab()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
