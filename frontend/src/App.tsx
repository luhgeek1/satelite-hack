import React, { useState, useEffect } from 'react';
import { Play, Pause, Upload, ShieldAlert, BarChart3, ChevronDown, AlertTriangle, Plus, X, Activity, PanelRightClose, PanelRightOpen, Globe as GlobeIcon } from 'lucide-react';
import { Globe, planeColors, type GlobeCameraPosition, type OrbitTrack } from './components/Globe';
import { criticalityLevel } from './lib/criticality';
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

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
 * One entry in the parameter ledger. The left rail carries the subsystem
 * mnemonic against a continuous hairline spine, so the column reads as an
 * equipment index rather than a stack of lids. The value stays visible when a
 * group is shut, so the shut panel is still a summary of the scenario.
 */
const ParamGroup: React.FC<{
  code: string;
  title: string;
  value: React.ReactNode;
  alarm?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ code, title, value, alarm, open, onToggle, children }) => (
  <section className="border-b border-rule last:border-b-0">
    <h3>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-stretch text-left focus-visible:outline-none"
      >
        <span
          className={cn(
            "flex w-9 flex-shrink-0 items-center justify-center border-r border-rule py-2.5 font-data text-[10px] tracking-[0.08em] transition-colors",
            alarm ? "text-alarm" : open ? "text-zinc-300" : "text-zinc-500 group-hover:text-zinc-300"
          )}
        >
          {code}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition-colors group-hover:bg-white/[0.03] group-focus-visible:bg-white/[0.06]">
          <span className="truncate font-label text-[13px] text-zinc-300">{title}</span>
          <span
            className={cn(
              "ml-auto font-data text-[11px] tabular-nums",
              alarm ? "text-alarm" : "text-zinc-500"
            )}
          >
            {value}
          </span>
          <ChevronDown
            size={12}
            className={cn("flex-shrink-0 text-zinc-600 transition-transform duration-200", !open && "-rotate-90")}
          />
        </span>
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
          {/* The empty rail cell keeps the spine unbroken through the body. */}
          <div className="flex">
            <div className="w-9 flex-shrink-0 border-r border-rule" />
            <div className="min-w-0 flex-1 px-3 pb-4 pt-1">{children}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </section>
);

/** Fixed-width degrees, the way a parameter table prints them: `007.5`. */
const formatDegrees = (value: number) => value.toFixed(1).padStart(5, '0');

/**
 * Slide-rule control on a single line: label and full scale on the left, the
 * reading on the right, and the tick bed drawn *inside* the track rather than
 * stacked under it, so the scale costs no extra height. Major ticks land on
 * values an operator names (every 90 deg of RAAN, every 7.5 of phase).
 */
const ScaleRow: React.FC<{
  id: string;
  label: string;
  value: number;
  max: number;
  step: number;
  ticks: number;
  majorEvery: number;
  onChange: (value: number) => void;
}> = ({ id, label, value, max, step, ticks, majorEvery, onChange }) => (
  <div className="flex items-center gap-2.5">
    <label
      htmlFor={id}
      className="w-[3.5rem] flex-shrink-0 whitespace-nowrap font-data text-[10px] tracking-[0.06em] text-zinc-500"
    >
      {label}
    </label>

    <div className="relative h-[15px] min-w-0 flex-1">
      {/* Inset by half a cursor width so the bed matches the travel the cursor
          actually has, not the input's outer box. */}
      <div
        className="pointer-events-none absolute inset-x-[5px] top-1/2 flex items-start justify-between"
        aria-hidden="true"
      >
        {Array.from({ length: ticks }).map((_, index) => (
          <span
            key={index}
            className={cn("w-px", index % majorEvery === 0 ? "h-[6px] bg-zinc-700" : "h-[3px] bg-zinc-800")}
          />
        ))}
      </div>

      <input
        id={id}
        type="range"
        className="param-scale absolute inset-0 w-full"
        style={{ ['--fill' as string]: `${(value / max) * 100}%` }}
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(parseFloat(event.target.value))}
      />
    </div>

    <span className="w-[3.25rem] flex-shrink-0 text-right font-data text-[11px] tabular-nums text-zinc-200">
      {formatDegrees(value)}
      <span className="text-zinc-500">&deg;</span>
    </span>
  </div>
);

const sidebarButtonClass =
  "hidden h-7 w-7 items-center justify-center border border-rule-strong bg-black/85 text-zinc-500 backdrop-blur transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none focus-visible:border-zinc-400 focus-visible:text-zinc-100 lg:flex";
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
          className="fixed top-0 bottom-0 right-0 z-50 flex w-[88vw] max-w-sm flex-col border-l border-rule-strong bg-[black] lg:hidden"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-rule px-4 py-3">
            <span className="font-label text-[13px] text-zinc-300">{title}</span>
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
        <ParamGroup
          code="DPL"
          title="Deployment"
          value={`${deployedCount} SV`}
          open={openGroups.deployment}
          onToggle={() => toggleGroup('deployment')}
        >
          {/* Stages are cumulative, so the control is one segmented readout
              rather than three independent options. Selection reads by
              inversion, not by hue. */}
          <div className="mt-1 flex border border-rule-strong">
            {([1, 2, 3] as const).map(stage => (
              <button
                key={stage}
                type="button"
                onClick={() => setDeploymentStage(stage)}
                aria-pressed={deploymentStage === stage}
                aria-label={`Deploy ${stage * 16} satellites`}
                className={cn(
                  "flex-1 border-l border-rule-strong py-1.5 font-data text-[11px] tabular-nums transition-colors first:border-l-0 focus-visible:outline-none focus-visible:bg-white/15 focus-visible:text-zinc-100",
                  deploymentStage === stage
                    ? "bg-zinc-100 text-black"
                    : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                )}
              >
                {stage * 16}
              </button>
            ))}
          </div>
          <p className="mt-2 font-label text-[11px] leading-relaxed text-zinc-500">
            Stage {deploymentStage} of 3, 16 satellites per plane.
          </p>
        </ParamGroup>

        <ParamGroup
          code="ORB"
          title="Orbital planes"
          value={planeIds.map(plane => Math.round(planesConfig[plane].raan).toString().padStart(3, '0')).join(' ')}
          open={openGroups.planes}
          onToggle={() => toggleGroup('planes')}
        >
          <div className="space-y-3">
            {planeIds.map(plane => (
              <div key={plane}>
                <div className="flex items-center gap-2 border-b border-rule pb-1">
                  {/* The only hue in the geometry block: plane identity, shared
                      with the orbit lines on the globe. */}
                  <span className="h-2.5 w-0.5" style={{ background: planeColors[plane] }} />
                  <span className="font-data text-[11px] text-zinc-200">{plane}</span>
                  <span className="ml-auto font-data text-[10px] tabular-nums text-zinc-500">
                    {satellites.filter(sat => sat.plane === plane).length} SV
                  </span>
                </div>

                <div className="mt-1.5 space-y-1">
                  <ScaleRow
                    id={`${plane}-raan`}
                    label="RAAN"
                    value={planesConfig[plane].raan}
                    max={360}
                    step={1}
                    ticks={13}
                    majorEvery={3}
                    onChange={next => setPlanesConfig(prev => ({
                      ...prev,
                      [plane]: { ...prev[plane], raan: next }
                    }))}
                  />
                  <ScaleRow
                    id={`${plane}-phase`}
                    label="PHASE"
                    value={planesConfig[plane].phase}
                    max={22.5}
                    step={0.5}
                    ticks={10}
                    majorEvery={3}
                    onChange={next => setPlanesConfig(prev => ({
                      ...prev,
                      [plane]: { ...prev[plane], phase: next }
                    }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 font-label text-[11px] leading-relaxed text-zinc-500">
            RAAN 0&ndash;360&deg;, phase 0&ndash;22.5&deg; per plane.
          </p>
        </ParamGroup>

        <ParamGroup
          code="FLT"
          title="Failures"
          alarm={failedSatellites.length > 0}
          value={failedSatellites.length ? `${failedSatellites.length} DOWN` : 'NONE'}
          open={openGroups.failures}
          onToggle={() => toggleGroup('failures')}
        >
          <div className="mt-1 space-y-1.5">
            {failedSatellites.map(satellite => (
              <div
                key={satellite.id}
                className="flex items-center gap-2.5 border-l-2 border-alarm bg-white/[0.03] py-1.5 pl-2.5 pr-2"
              >
                <span className="font-data text-[10px] text-alarm">FAIL</span>
                <span className="font-data text-[11px] text-zinc-200">{satellite.id}</span>
                <span className="font-data text-[10px] text-zinc-500">{satellite.plane}</span>
                <button
                  type="button"
                  className="ml-auto font-label text-[11px] text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline focus-visible:outline-none focus-visible:text-zinc-100 focus-visible:underline"
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
              <p className="font-label text-[11px] leading-relaxed text-zinc-500">
                All {deployedCount} nodes nominal. Inject a failure to see how routing copes.
              </p>
            )}

            {showFailureSelect ? (
              <div className="space-y-2 border border-rule-strong p-2">
                <label htmlFor="failure-target" className="block font-label text-[11px] text-zinc-400">
                  Which satellite fails?
                </label>
                <select
                  id="failure-target"
                  autoFocus
                  className="param-select w-full border border-rule-strong bg-black py-1.5 pl-2 pr-6 font-data text-[11px] text-zinc-200 focus:border-zinc-500 focus:outline-none"
                  onChange={event => {
                    if (event.target.value) handleSimulateFailure(event.target.value);
                    setShowFailureSelect(false);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select a node</option>
                  {dynamicSatellites.filter(sat => sat.status === 'active').map(sat => (
                    <option key={sat.id} value={sat.id}>{sat.id}   {sat.plane}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="w-full border border-rule py-1.5 font-label text-[11px] text-zinc-500 transition-colors hover:border-rule-strong hover:text-zinc-300 focus-visible:outline-none focus-visible:border-zinc-500"
                  onClick={() => setShowFailureSelect(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mt-2 flex w-full items-center justify-center gap-1.5 border border-rule-strong py-1.5 font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none focus-visible:border-zinc-400 focus-visible:text-zinc-100"
                onClick={() => setShowFailureSelect(true)}
              >
                <Plus size={12} /> Inject failure
              </button>
            )}
          </div>
        </ParamGroup>

        <ParamGroup
          code="SV"
          title="Satellites"
          value={`${deployedCount}/${satellites.length}`}
          open={openGroups.satellites}
          onToggle={() => toggleGroup('satellites')}
        >
          {/* A real table header, not an eyebrow: it names the value columns. */}
          <div className="flex items-center gap-2 border-b border-rule pb-1 pl-[10px] pr-0.5 font-data text-[9px] tracking-[0.08em] text-zinc-500">
            <span>NODE</span>
            <span className="ml-auto">PLANE</span>
            <span className="w-9 text-right">STATE</span>
          </div>

          <div className="max-h-[clamp(9rem,24vh,17rem)] overflow-y-auto overscroll-contain">
            {satellites.map((satellite, index) => {
              const isDeployed = index < deployedCount;
              const isSelected = selectedSatellite === satellite.id;
              const state = !isDeployed ? 'STBY' : satellite.status === 'failed' ? 'FAIL' : 'NOM';

              return (
                <button
                  key={satellite.id}
                  type="button"
                  onClick={() => selectSatellite(satellite.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-center gap-2 border-l-2 py-1 pl-2 pr-0.5 text-left font-data text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:bg-white/[0.08]",
                    isSelected
                      ? "border-zinc-200 bg-white/[0.06] text-zinc-100"
                      : "border-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200",
                    !isDeployed && "text-zinc-600 hover:text-zinc-400"
                  )}
                >
                  <span>{satellite.id}</span>
                  <span className="ml-auto text-zinc-500">{satellite.plane}</span>
                  <span className={cn("w-9 text-right text-[10px]", state === 'FAIL' ? "text-alarm" : "text-zinc-500")}>
                    {state}
                  </span>
                </button>
              );
            })}
          </div>
        </ParamGroup>

        <ParamGroup
          code="GND"
          title="Ground sites"
          value={`${gateways.length} GW  ${groundStations.length} CL`}
          open={openGroups.sites}
          onToggle={() => toggleGroup('sites')}
        >
          <div className="space-y-2.5">
            {allSites.map(site => {
              const isGateway = site.role === 'gateway';
              return (
                <div key={site.id} className="flex items-start gap-2.5">
                  {/* Shape keeps the mapping to the globe markers; the hue is
                      dropped, since shape alone carries it. */}
                  <span className={cn(
                    "mt-1 h-2 w-2 shrink-0 bg-zinc-500",
                    isGateway
                      ? "rotate-45"
                      : "[clip-path:polygon(50%_0,100%_100%,0_100%)]"
                  )} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-data text-[11px] text-zinc-200">{site.id}</span>
                      <span className="truncate font-label text-[11px] text-zinc-500">{site.name}</span>
                      <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-zinc-500">
                        {isGateway ? 'GW' : 'CL'}
                      </span>
                    </div>
                    <div className="font-data text-[10px] tabular-nums text-zinc-500">
                      {formatLatitude(site.lat)}  {formatLongitude(site.lon)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ParamGroup>
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
    // The card states a target, so that threshold — not an invented warning
    // band — is what decides whether a reading is called out.
    const belowTarget = Object.values(metrics.availability).some(v => (v as number) < 90);
    const degraded = belowTarget || !hasRoute;

    return (
      <div className="pointer-events-none absolute left-3 top-3 z-10 w-[190px] border border-rule-strong bg-black/70 p-3 backdrop-blur sm:w-[215px] lg:left-6 lg:top-6 lg:p-4">
        <button
          type="button"
          onClick={() => setNetworkHealthExpanded(expanded => !expanded)}
          className="pointer-events-auto flex w-full items-center gap-2 text-left transition-colors hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:outline-none"
          aria-expanded={networkHealthExpanded}
          title={networkHealthExpanded ? 'Collapse network health' : 'Expand network health'}
        >
          {/* Annunciator, not decoration: it only carries hue when something
              is actually off target. */}
          <span className={cn("h-1.5 w-1.5 shrink-0", degraded ? "bg-alarm" : "bg-zinc-500")} />
          <span className="font-label text-[12px] text-zinc-300">Network health</span>
          <ChevronDown
            size={13}
            className={cn(
              "ml-auto shrink-0 text-zinc-600 transition-transform duration-200",
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
              <div className="mt-3 space-y-1.5 font-data text-[11px] tabular-nums sm:text-xs">
                {Object.entries(metrics.availability).map(([id, v]) => {
                  const val = v as number;
                  return (
                    <div key={id} className="flex items-baseline justify-between gap-2">
                      <span className="text-zinc-400">{id}</span>
                      <span className={val >= 90 ? "text-zinc-100" : "text-alarm"}>{val.toFixed(1)}%</span>
                    </div>
                  );
                })}
                <div className="flex items-baseline justify-between gap-2 text-zinc-500">
                  <span className="font-label text-[12px]">Target</span>
                  <span>&ge; 90%</span>
                </div>
              </div>

              <div className="my-3 border-t border-rule" />

              <div className="flex items-baseline justify-between gap-2 font-data text-[11px] tabular-nums sm:text-xs">
                <span className="font-label text-[12px] text-zinc-400">Max outage</span>
                <span className="text-zinc-100">{metrics.maxOutageMinutes} min</span>
              </div>

              <div className="mt-3 font-data text-[11px] tabular-nums sm:text-xs">
                {hasRoute ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-label text-[12px] text-zinc-400">Route</span>
                      <span className="text-zinc-100">{activeRoute.length - 1} hops</span>
                    </div>
                    {/* The path needs no hue of its own: that it exists is
                        already said above, and its absence is the alarm. */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-1 text-zinc-300">
                      {activeRoute.map((node, i) => (
                        <React.Fragment key={i}>
                          <span>{node}</span>
                          {i < activeRoute.length - 1 && <span className="text-zinc-600">&rarr;</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 font-label text-[12px] text-alarm">
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
            tone: carriesRoute ? 'text-zinc-100' : 'text-zinc-500'
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
                    <div className={cn("mt-1.5 text-[11px]", failed ? "text-alarm" : "text-zinc-400")}>
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
  /** Panel identity, shared by both tabs: the scenario, not a decorative label. */
  const renderPanelHead = () => (
    <div className="flex-shrink-0 border-b border-rule px-3 pb-2.5 pt-3">
      <div className="font-label text-[11px] text-zinc-500">Scenario</div>
      <div className="truncate pr-9 font-data text-[13px] text-zinc-100">01_full_constellation</div>
    </div>
  );

  const renderDataPanel = (includeSatelliteOverlay = false) => {
    const deployedCount = deploymentStage * 16;

    return (
      <>
        {renderPanelHead()}

        <motion.div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {renderConfigSection()}
        </motion.div>

        {/* The primary action stays reachable while the column scrolls. */}
        <div className="flex-shrink-0 border-t border-rule p-3">
          <button
            type="button"
            disabled={simulating}
            onClick={() => {
              setSimulating(true);
              // TODO(BACKEND): Run the selected scenario through the simulation API.
              setTimeout(() => setSimulating(false), 1500);
            }}
            className={cn(
              "group relative flex h-10 w-full items-center justify-between overflow-hidden border px-3 font-label text-[13px] transition-colors focus-visible:outline-none",
              simulating
                ? "cursor-wait border-rule-strong text-zinc-400"
                : "border-zinc-600 text-zinc-100 hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300 focus-visible:bg-white/10"
            )}
          >
            <span>{simulating ? 'Running' : 'Run simulation'}</span>
            <span
              className={cn(
                "font-data text-[10px] tabular-nums transition-colors",
                simulating ? "text-zinc-600" : "text-zinc-500 group-hover:text-black/55"
              )}
            >
              {deployedCount} SV / 24 h
            </span>

            {/* One orchestrated motion in the panel: a sweep along the button's
                own edge while the run is in flight. */}
            {simulating && (
              <motion.span
                className="absolute bottom-0 left-0 h-px w-1/3 bg-zinc-300"
                animate={{ x: ['-110%', '330%'] }}
                transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
              />
            )}
          </button>
        </div>

        {includeSatelliteOverlay && renderSatelliteOverlay()}
      </>
    );
  };

  const renderCriticalNodesPanel = () => {
    const ranked = [...satellites].sort((a, b) => b.criticality - a.criticality).slice(0, 4);

    return (
      <>
        {renderPanelHead()}

        <motion.div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {/* The rail carries the rank instead of a subsystem mnemonic: this
              list really is ordered, so the numbering is information. */}
          {ranked.map((sat, index) => {
            const level = criticalityLevel(sat.criticality);
            const isSelected = selectedSatellite === sat.id;
            // Same impact model the satellite detail panel uses, so the two
            // never disagree.
            const impact = ((sat.criticality / 100) * 16).toFixed(1);

            return (
              <button
                key={sat.id}
                type="button"
                onClick={() => selectSatellite(sat.id)}
                aria-pressed={isSelected}
                className={cn(
                  "flex w-full items-stretch border-b border-rule text-left transition-colors focus-visible:outline-none",
                  isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03] focus-visible:bg-white/[0.06]"
                )}
              >
                <span
                  className={cn(
                    "flex w-9 flex-shrink-0 items-start justify-center border-r border-rule pt-2.5 font-data text-[10px] tabular-nums",
                    isSelected ? "text-zinc-200" : "text-zinc-500"
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>

                <span className="min-w-0 flex-1 px-3 py-2.5">
                  <span className="flex items-baseline gap-2">
                    <span className="font-data text-[12px] text-zinc-100">{sat.id}</span>
                    <span
                      className={cn(
                        "ml-auto font-data text-[9px] tracking-[0.08em]",
                        level.label === 'Critical' ? "text-alarm" : "text-zinc-500"
                      )}
                    >
                      {level.token}
                    </span>
                    <span className="w-6 text-right font-data text-[11px] tabular-nums text-zinc-200">
                      {sat.criticality}
                    </span>
                  </span>

                  {/* No magnitude bar: these scores cluster in the 70s-90s, so
                      a 0-100 bar is a near-full rule that reads as a divider
                      and says less than the number already does. */}
                  <span className="mt-1.5 flex items-baseline justify-between gap-2">
                    <span className="font-label text-[11px] text-zinc-500">Availability impact</span>
                    <span className="font-data text-[11px] tabular-nums text-zinc-200">&minus;{impact}%</span>
                  </span>
                </span>
              </button>
            );
          })}
        </motion.div>

        <div className="flex-shrink-0 border-t border-rule p-3">
          <button
            type="button"
            onClick={handleOptimize}
            className="group flex h-10 w-full items-center justify-between border border-zinc-600 px-3 font-label text-[13px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300 focus-visible:bg-white/10 focus-visible:outline-none"
          >
            <span>Optimize configuration</span>
            <span className="font-data text-[10px] tabular-nums text-zinc-500 transition-colors group-hover:text-black/55">
              500 candidates
            </span>
          </button>
        </div>

        {/* TODO(BACKEND): Replace fixture progress, recommendations and result metrics with optimizer-job data. */}
        <AnimatePresence>
          {optimizationState !== 'none' && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute inset-0 z-30 flex flex-col bg-[black]"
            >
              {optimizationState === 'running' ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6">
                  <div className="w-full max-w-[220px]">
                    <div className="font-label text-[13px] text-zinc-200">Searching configurations</div>
                    <div className="mt-1 font-data text-[11px] tabular-nums text-zinc-500">124 / 500 explored</div>
                    {/* Same sweep as the run button, so "working" reads the
                        same way everywhere in the app. */}
                    <div className="relative mt-3 h-px w-full overflow-hidden bg-rule-strong">
                      <motion.span
                        className="absolute inset-y-0 left-0 w-1/3 bg-zinc-300"
                        animate={{ x: ['-110%', '330%'] }}
                        transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex flex-shrink-0 items-start justify-between border-b border-rule px-3 pb-2.5 pt-3">
                    <div>
                      <div className="font-label text-[11px] text-zinc-500">Optimizer</div>
                      <div className="font-data text-[13px] text-zinc-100">Recommended</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOptimizationState('none')}
                      aria-label="Dismiss recommendation"
                      className="text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:outline-none"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {/* Before and after on one baseline, so the gain is read by
                        comparing two numbers rather than two cards. */}
                    {[
                      { label: 'Availability', from: '96.7', to: '98.1', unit: '%' },
                      { label: 'Max outage', from: '26', to: '14', unit: 'min' }
                    ].map(row => (
                      <div
                        key={row.label}
                        className="flex items-baseline gap-2 border-b border-rule px-3 py-2.5"
                      >
                        <span className="font-label text-[12px] text-zinc-400">{row.label}</span>
                        <span className="ml-auto font-data text-[11px] tabular-nums text-zinc-600">{row.from}</span>
                        <span className="font-data text-[11px] text-zinc-700">&rarr;</span>
                        <span className="font-data text-[12px] tabular-nums text-zinc-100">{row.to}</span>
                        <span className="w-7 font-data text-[10px] text-zinc-500">{row.unit}</span>
                      </div>
                    ))}

                    <div className="border-b border-rule px-3 py-2.5">
                      <div className="font-label text-[12px] text-zinc-400">Orbit changes</div>
                      <div className="mt-2 space-y-1.5">
                        {[
                          { plane: 'P2', param: 'RAAN', from: 60, to: 56 },
                          { plane: 'P2', param: 'PHASE', from: 7.5, to: 13 },
                          { plane: 'P3', param: 'RAAN', from: 120, to: 124 }
                        ].map(change => (
                          <div
                            key={`${change.plane}-${change.param}`}
                            className="flex items-baseline gap-2 font-data text-[11px] tabular-nums"
                          >
                            <span className="h-2.5 w-0.5 self-center" style={{ background: planeColors[change.plane as Plane] }} />
                            <span className="text-zinc-300">{change.plane}</span>
                            <span className="text-[10px] text-zinc-500">{change.param}</span>
                            <span className="ml-auto text-zinc-600">{formatDegrees(change.from)}</span>
                            <span className="text-zinc-700">&rarr;</span>
                            <span className="text-zinc-100">{formatDegrees(change.to)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 space-y-2 border-t border-rule p-3">
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-center border border-zinc-600 font-label text-[13px] text-zinc-100 transition-colors hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300 focus-visible:bg-white/10 focus-visible:outline-none"
                      onClick={() => {
                        setMetrics(optimizedMetrics);
                        setOptimizationState('none');
                      }}
                    >
                      Apply configuration
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-full items-center justify-center border border-rule-strong font-label text-[12px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:border-zinc-400 focus-visible:text-zinc-100 focus-visible:outline-none"
                      onClick={() => {
                        setOptimizationState('none');
                        setActiveTab('compare');
                      }}
                    >
                      Compare with baseline
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  };

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
            className="relative hidden flex-shrink-0 flex-col overflow-hidden border-l border-rule-strong bg-[black] lg:flex"
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
        <div className="flex-shrink-0 border-t border-rule bg-[black]/90 px-3 py-2 backdrop-blur sm:px-4">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <button
              type="button"
              onClick={() => setPlaying(!playing)}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center border border-rule-strong text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white focus-visible:border-zinc-300 focus-visible:text-white focus-visible:outline-none"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <div className="flex flex-shrink-0 items-center border border-rule-strong">
              {[1, 4, 16].map(rate => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setSpeed(rate)}
                  aria-pressed={speed === rate}
                  className={cn(
                    "h-6 border-l border-rule-strong px-2 font-data text-[11px] tabular-nums transition-colors first:border-l-0 focus-visible:bg-white/15 focus-visible:text-zinc-100 focus-visible:outline-none",
                    speed === rate
                      ? "bg-white/[0.12] text-zinc-100"
                      : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                  )}
                >
                  x{rate}
                </button>
              ))}
            </div>

            <div className="flex flex-shrink-0 items-baseline gap-1 font-data text-sm tabular-nums text-zinc-100">
              {formatTime(time)}
              <span className="text-[10px] text-zinc-500">UTC</span>
            </div>

            <div className="hidden h-5 w-px flex-shrink-0 bg-rule-strong sm:block" />

            <div className="flex w-full min-w-0 basis-full items-center gap-2 sm:w-auto sm:flex-1 sm:basis-0">
              <span className="flex-shrink-0 font-data text-[10px] tabular-nums text-zinc-500">00:00</span>

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
                <div className="absolute inset-x-0 top-1/2 flex h-1.5 -translate-y-1/2 items-center overflow-hidden ring-offset-2 ring-offset-black group-focus-visible:ring-1 group-focus-visible:ring-zinc-400">
                  {/* The baseline runs the whole day underneath, so an outage
                      block reads as a mark *on* the timeline rather than as a
                      gap in it — which would invert the meaning. */}
                  <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-zinc-600" />
                  {activeRoute.length === 0 ? (
                    <div className="relative h-full w-full bg-zinc-400" />
                  ) : (
                    <>
                      <div className="w-[30%]" />
                      <div className="relative h-full w-[10%] bg-zinc-400" />
                      <div className="w-[40%]" />
                      <div className="relative h-full w-[5%] bg-zinc-400" />
                      <div className="w-[15%]" />
                    </>
                  )}
                </div>

                {/* Same cursor window as the parameter scales in the panel. */}
                <div
                  className="pointer-events-none absolute top-1/2 h-3.5 w-[9px] -translate-x-1/2 -translate-y-1/2 border-l border-r border-white transition-[left] duration-75"
                  style={{ left: `${(time / 1440) * 100}%` }}
                />
              </div>

              <span className="flex-shrink-0 font-data text-[10px] tabular-nums text-zinc-500">24:00</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right - data column (desktop) */}
      {renderDataColumn('simulation', renderDataPanel())}

      {/* Drawer (below lg) */}
      <MobileDrawer open={mobilePanel === 'data'} title="Configuration" onClose={() => setMobilePanel(null)}>
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
        {/* Legend for the globe dots: swatches come from the shared scale, so
            the key can never drift from what is drawn. */}
        <div className="absolute bottom-3 left-3 border border-rule-strong bg-[black]/80 p-3 backdrop-blur lg:top-6 lg:bottom-auto lg:left-6 lg:p-4">
          <div className="mb-2 font-label text-[12px] text-zinc-300 lg:mb-3">Node criticality</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 lg:block lg:space-y-1.5">
            {[0, 50, 75, 90].map(sample => {
              const level = criticalityLevel(sample);
              return (
                <div key={level.token} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0" style={{ background: level.color }} />
                  <span className="font-label text-[12px] text-zinc-400">{level.label}</span>
                  <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-zinc-600">{level.token}</span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {renderDataColumn('resilience', renderCriticalNodesPanel())}

      <MobileDrawer open={mobilePanel === 'data'} title="Critical nodes" onClose={() => setMobilePanel(null)}>
        <>
          {renderCriticalNodesPanel()}
          {renderSatelliteOverlay()}
        </>
      </MobileDrawer>
    </div>
  );

  /**
   * Two series, separated by lightness rather than hue. The pair validates at
   * CVD dE 35.7 against a floor of 8, and carries a dash pattern plus direct
   * labels so identity never rests on colour alone.
   */
  const seriesInk = { baseline: '#6b6b72', optimized: '#d9d9de' };

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

    // TODO(BACKEND): Replace fixture deltas with the simulation's own summary.
    // Availability moves in percentage points, not percent — the old "+1.4%"
    // read as a relative change, which it is not.
    const comparison = [
      { metric: 'Availability', baseline: '96.7%', optimized: '98.1%', delta: '+1.4 pp' },
      { metric: 'Max outage', baseline: '26 min', optimized: '14 min', delta: '−46%' },
      { metric: 'Critical nodes', baseline: '5', optimized: '2', delta: '−3' }
    ];

    /** Outage windows as a share of the day, in order across 00:00-24:00. */
    const outageRuns: Record<'baseline' | 'optimized', { up: number; down: number }[]> = {
      baseline: [{ up: 10, down: 5 }, { up: 15, down: 8 }, { up: 30, down: 12 }, { up: 20, down: 0 }],
      optimized: [{ up: 30, down: 3 }, { up: 45, down: 2 }, { up: 20, down: 0 }]
    };

    const renderOutageStrip = (key: 'baseline' | 'optimized') => (
      <div className="relative flex h-4 min-w-0 flex-1 items-center">
        {/* Same idiom as the playback strip: the day runs unbroken underneath,
            so a block reads as an outage on the timeline, not a gap in it. */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-600" />
        <div className="relative flex h-1.5 w-full items-center">
          {outageRuns[key].map((run, index) => (
            <React.Fragment key={index}>
              <span style={{ width: `${run.up}%` }} />
              {run.down > 0 && (
                <span
                  className="h-full"
                  style={{ width: `${run.down}%`, background: seriesInk[key] }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );

    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[black] p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8">

          {/* The two operands: A is the reference, B the candidate, and the
              weight of each says which is which. */}
          <div className="flex items-stretch gap-3 sm:gap-4">
            {([
              { key: 'A', label: 'Baseline', lead: false },
              { key: 'B', label: 'Optimized', lead: true }
            ] as const).map((side, index) => (
              <React.Fragment key={side.key}>
                {index === 1 && (
                  <div className="flex flex-shrink-0 items-center font-data text-[10px] tracking-[0.08em] text-zinc-600">
                    VS
                  </div>
                )}
                <button
                  type="button"
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3 border px-3 py-2.5 text-left transition-colors focus-visible:outline-none",
                    side.lead
                      ? "border-zinc-600 hover:border-zinc-400 focus-visible:border-zinc-300"
                      : "border-rule-strong hover:border-zinc-600 focus-visible:border-zinc-400"
                  )}
                >
                  <span className={cn("font-data text-[11px]", side.lead ? "text-zinc-300" : "text-zinc-500")}>
                    {side.key}
                  </span>
                  <span className={cn("truncate font-label text-[13px]", side.lead ? "text-zinc-100" : "text-zinc-400")}>
                    {side.label}
                  </span>
                  <ChevronDown size={13} className="ml-auto flex-shrink-0 text-zinc-600" />
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* A KPI row: each tile leads with the value the scenario would have,
              and carries its reference and delta underneath. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {comparison.map(row => (
              <div key={row.metric} className="flex flex-col border border-rule-strong">
                <div className="flex-1 px-3 pb-4 pt-3">
                  <div className="font-label text-[12px] text-zinc-400">{row.metric}</div>
                  <div className="mt-2 font-data text-[26px] leading-none tabular-nums text-zinc-100">
                    {row.optimized}
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-t border-rule px-3 py-2">
                  <span className="font-data text-[11px] tabular-nums text-zinc-500">
                    <span className="text-zinc-600">was</span> {row.baseline}
                  </span>
                  <span className="font-data text-[11px] tabular-nums text-zinc-300">{row.delta}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="border border-rule-strong p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <h3 className="font-label text-[13px] text-zinc-300">Availability over 24 hours</h3>
              {/* Legend carries the dash pattern, so it maps to the plot even
                  in greyscale print or forced-colours mode. */}
              <div className="flex items-center gap-4">
                {([
                  { label: 'Baseline', ink: seriesInk.baseline, dash: '4 3' },
                  { label: 'Optimized', ink: seriesInk.optimized, dash: undefined },
                  { label: 'Target 90%', ink: '#52525b', dash: '2 3' }
                ] as const).map(series => (
                  <div key={series.label} className="flex items-center gap-1.5">
                    <svg width="16" height="2" aria-hidden="true">
                      <line
                        x1="0" y1="1" x2="16" y2="1"
                        stroke={series.ink}
                        strokeWidth="2"
                        strokeDasharray={series.dash}
                      />
                    </svg>
                    <span className="font-label text-[12px] text-zinc-400">{series.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 h-48 sm:h-56 lg:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1f1f23" strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#3f3f46"
                    tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                    tickMargin={8}
                    minTickGap={40}
                  />
                  <YAxis
                    domain={[70, 100]}
                    ticks={[70, 80, 90, 100]}
                    stroke="#3f3f46"
                    tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                    width={40}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: '#000',
                      border: '1px solid #2e2e34',
                      borderRadius: 0,
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 11
                    }}
                    itemStyle={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}
                    labelStyle={{ color: '#a1a1aa', marginBottom: 4, fontSize: 11 }}
                    formatter={(value: unknown, name: unknown) => [
                      `${value}%`,
                      String(name) === 'baseline' ? 'Baseline' : 'Optimized'
                    ]}
                  />
                  <ReferenceLine y={90} stroke="#52525b" strokeDasharray="2 3" />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    stroke={seriesInk.baseline}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 4, fill: seriesInk.baseline, stroke: '#000', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="optimized"
                    stroke={seriesInk.optimized}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: seriesInk.optimized, stroke: '#000', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-rule-strong p-4 sm:p-5">
            <h3 className="font-label text-[13px] text-zinc-300">Outage windows</h3>

            <div className="mt-4 space-y-3">
              {([
                { key: 'baseline' as const, label: 'Baseline', total: '26 min' },
                { key: 'optimized' as const, label: 'Optimized', total: '14 min' }
              ]).map(row => (
                <div key={row.key} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "w-20 flex-shrink-0 font-label text-[12px]",
                      row.key === 'optimized' ? "text-zinc-200" : "text-zinc-500"
                    )}
                  >
                    {row.label}
                  </span>
                  {renderOutageStrip(row.key)}
                  <span className="w-14 flex-shrink-0 text-right font-data text-[11px] tabular-nums text-zinc-400">
                    {row.total}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex justify-between pl-[5.75rem] pr-[4.25rem] font-data text-[9px] tabular-nums text-zinc-600">
              <span>00:00</span>
              <span>24:00</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[black] font-sans text-zinc-300">
      {/* Header */}
      <header className="z-10 grid h-14 flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-rule bg-[black] px-3 sm:gap-4 sm:px-6 lg:h-16">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-rule-strong">
            <GlobeIcon className="h-4 w-4 text-zinc-300" />
          </div>
          <div className="hidden min-w-0 sm:block">
            <h1 className="truncate font-label text-[14px] font-semibold leading-tight text-zinc-100">OrbitGuard</h1>
            <div className="hidden font-label text-[11px] leading-tight text-zinc-500 lg:block">
              Satellite resilience studio
            </div>
          </div>
        </div>

        <div className="flex h-9 flex-shrink-0 items-center border border-rule-strong">
          {tabMeta.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              title={label}
              aria-label={label}
              aria-pressed={activeTab === id}
              className={cn(
                "flex h-full items-center gap-2 border-l border-rule-strong px-2.5 font-label text-[13px] transition-colors first:border-l-0 focus-visible:bg-white/15 focus-visible:text-zinc-100 focus-visible:outline-none sm:px-4 lg:px-6",
                activeTab === id
                  ? "bg-white/[0.12] text-zinc-100"
                  : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
              )}
            >
              <Icon size={14} className="md:hidden" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <button
            type="button"
            className="hidden h-8 items-center border border-rule-strong px-3 transition-colors hover:border-zinc-600 focus-visible:border-zinc-400 focus-visible:outline-none xl:flex"
          >
            <span className="mr-2 font-label text-[12px] text-zinc-500">Scenario</span>
            <span className="truncate font-data text-[12px] text-zinc-200">01_full_constellation</span>
            <ChevronDown size={13} className="ml-2 flex-shrink-0 text-zinc-600" />
          </button>

          <button
            type="button"
            title="Import JSON"
            className="flex h-8 flex-shrink-0 items-center border border-rule-strong px-2.5 font-label text-[12px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:border-zinc-400 focus-visible:text-zinc-100 focus-visible:outline-none sm:px-3"
          >
            <Upload size={13} className="sm:mr-2" /> <span className="hidden sm:inline">JSON</span>
          </button>

          {/* Annunciator, same grammar as the network-health card. */}
          <div className="hidden h-8 flex-shrink-0 items-center gap-2 border border-rule-strong px-2.5 sm:flex">
            <span className="h-1.5 w-1.5 bg-zinc-500" />
            <span className="font-data text-[10px] tracking-[0.08em] text-zinc-400">READY</span>
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
