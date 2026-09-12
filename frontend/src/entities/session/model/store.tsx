'use client';

import * as React from 'react';
import { isFiniteNumber, isRecord, readStored, writeStored } from '@/shared/lib';
import type { FailureDto, RoutingStrategy, SimulationConfig } from '@/shared/api';

export type StudioTab = 'simulation' | 'resilience' | 'compare';
export type ViewMode = '3d' | '2d';

export interface SessionState {
  scenarioId: string | null;
  config: SimulationConfig;
  strategy: RoutingStrategy;
  tS: number;
  playing: boolean;
  speed: number;
  selectedSatelliteId: string | null;
  selectedClientId: string | null;
  viewMode: ViewMode;
  tab: StudioTab;
  focusRequest: { id: string; nonce: number } | null;
  /** Bumped when a control is released, so a run can start without waiting. */
  commitNonce: number;
}

type Action =
  | { type: 'selectScenario'; scenarioId: string }
  | { type: 'setLaunchStage'; stage: 1 | 2 | 3 }
  | { type: 'setPlane'; planeId: string; raanDeg?: number; phaseDeg?: number }
  | { type: 'applyPlanes'; planes: Record<string, { raan_deg?: number; phase_deg?: number }> }
  | { type: 'commitConfig' }
  | { type: 'addFailure'; failure: FailureDto }
  | { type: 'removeFailure'; satelliteId: string }
  | { type: 'clearFailures' }
  | { type: 'setStrategy'; strategy: RoutingStrategy }
  | { type: 'seek'; tS: number }
  | { type: 'advance'; stepS: number; horizonS: number }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'setSpeed'; speed: number }
  | { type: 'selectSatellite'; satelliteId: string | null; focus?: boolean }
  | { type: 'selectClient'; clientId: string | null }
  | { type: 'setViewMode'; viewMode: ViewMode }
  | { type: 'setTab'; tab: StudioTab }
  | { type: 'resetConfig' }
  | { type: 'restore'; state: Partial<SessionState> };

const initialState: SessionState = {
  scenarioId: null,
  config: {},
  strategy: 'min_hops',
  tS: 0,
  playing: false,
  speed: 1,
  selectedSatelliteId: null,
  selectedClientId: null,
  viewMode: '3d',
  tab: 'simulation',
  focusRequest: null,
  commitNonce: 0,
};

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'selectScenario':
      return {
        ...state,
        scenarioId: action.scenarioId,
        config: {},
        tS: 0,
        playing: false,
        selectedSatelliteId: null,
        selectedClientId: null,
      };

    case 'setLaunchStage':
      return { ...state, config: { ...state.config, launch_stage: action.stage } };

    case 'setPlane': {
      const current = state.config.planes?.[action.planeId] ?? {};
      return {
        ...state,
        config: {
          ...state.config,
          planes: {
            ...state.config.planes,
            [action.planeId]: {
              raan_deg: action.raanDeg ?? current.raan_deg,
              phase_deg: action.phaseDeg ?? current.phase_deg,
            },
          },
        },
      };
    }

    case 'applyPlanes':
      return {
        ...state,
        config: { ...state.config, planes: { ...state.config.planes, ...action.planes } },
        commitNonce: state.commitNonce + 1,
      };

    // Letting go of a slider is the end of a gesture, not a pause in it. The
    // value is already in `config`; this only tells the run pipeline that no
    // further change is coming, so it need not sit out another settle window.
    case 'commitConfig':
      return { ...state, commitNonce: state.commitNonce + 1 };

    case 'addFailure': {
      const failures = (state.config.failures ?? []).filter(
        (failure) => failure.satellite_id !== action.failure.satellite_id,
      );
      return { ...state, config: { ...state.config, failures: [...failures, action.failure] } };
    }

    case 'removeFailure':
      return {
        ...state,
        config: {
          ...state.config,
          failures: (state.config.failures ?? []).filter(
            (failure) => failure.satellite_id !== action.satelliteId,
          ),
        },
      };

    case 'clearFailures':
      return { ...state, config: { ...state.config, failures: [] } };

    case 'setStrategy':
      return { ...state, strategy: action.strategy };

    case 'seek':
      return { ...state, tS: Math.max(0, action.tS) };

    case 'advance':
      return { ...state, tS: (state.tS + action.stepS) % action.horizonS };

    case 'setPlaying':
      return { ...state, playing: action.playing };

    case 'setSpeed':
      return { ...state, speed: action.speed };

    case 'selectSatellite': {
      const selectedSatelliteId =
        state.selectedSatelliteId === action.satelliteId ? null : action.satelliteId;
      return {
        ...state,
        selectedSatelliteId,
        focusRequest:
          selectedSatelliteId === null
            ? null
            : action.focus
              ? { id: selectedSatelliteId, nonce: Date.now() }
              : state.focusRequest,
      };
    }

    case 'selectClient':
      return { ...state, selectedClientId: action.clientId };

    case 'setViewMode':
      return { ...state, viewMode: action.viewMode };

    case 'setTab':
      return { ...state, tab: action.tab };

    case 'resetConfig':
      return { ...state, config: {}, tS: 0, playing: false };

    // Whatever survived the last visit, merged over the defaults. Playback is
    // deliberately not among the restored fields: a page that starts running
    // by itself is a surprise, not a convenience.
    case 'restore':
      return {
        ...state,
        ...action.state,
        playing: false,
        focusRequest: null,
        commitNonce: state.commitNonce,
      };

    default:
      return state;
  }
}

/** Bumped whenever the persisted shape changes, so old entries are ignored. */
const STORAGE_KEY = 'orbitguard-session-v1';

type PersistedSession = Pick<
  SessionState,
  | 'scenarioId'
  | 'config'
  | 'strategy'
  | 'tS'
  | 'selectedSatelliteId'
  | 'selectedClientId'
  | 'viewMode'
  | 'tab'
>;

const TABS: StudioTab[] = ['simulation', 'resilience', 'compare'];
const VIEW_MODES: ViewMode[] = ['3d', '2d'];

const isSession = (value: unknown): value is Partial<PersistedSession> => {
  if (!isRecord(value)) return false;
  const { scenarioId, config, tS, selectedSatelliteId, selectedClientId, viewMode, tab } = value;
  if (scenarioId !== undefined && scenarioId !== null && typeof scenarioId !== 'string') return false;
  if (config !== undefined && !isRecord(config)) return false;
  if (tS !== undefined && !isFiniteNumber(tS)) return false;
  if (selectedSatelliteId !== undefined && selectedSatelliteId !== null && typeof selectedSatelliteId !== 'string') return false;
  if (selectedClientId !== undefined && selectedClientId !== null && typeof selectedClientId !== 'string') return false;
  if (viewMode !== undefined && !VIEW_MODES.includes(viewMode as ViewMode)) return false;
  if (tab !== undefined && !TABS.includes(tab as StudioTab)) return false;
  return true;
};

const persisted = (state: SessionState): PersistedSession => ({
  scenarioId: state.scenarioId,
  config: state.config,
  strategy: state.strategy,
  tS: state.tS,
  selectedSatelliteId: state.selectedSatelliteId,
  selectedClientId: state.selectedClientId,
  viewMode: state.viewMode,
  tab: state.tab,
});

interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<Action>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [restored, setRestored] = React.useState(false);

  // Read after mount rather than in the reducer's initialiser: the page is
  // prerendered, and restoring during the first render would make the server's
  // markup and the client's disagree.
  React.useEffect(() => {
    const saved = readStored(STORAGE_KEY, isSession);
    if (saved) dispatch({ type: 'restore', state: saved });
    setRestored(true);
  }, []);

  // Writing before the restore has landed would save the defaults over the
  // session we are about to read.
  //
  // The write also trails the state rather than riding it: a slider drag
  // dispatches on every pointer frame, and localStorage is synchronous, so a
  // write per frame puts a serialise in front of each repaint. The session
  // only has to survive a reload, and a page that goes away before the timer
  // fires is flushed below.
  const pending = React.useRef<SessionState>(state);

  React.useEffect(() => {
    pending.current = state;
    if (!restored) return;
    const timer = window.setTimeout(() => writeStored(STORAGE_KEY, persisted(state)), 400);
    return () => window.clearTimeout(timer);
  }, [state, restored]);

  React.useEffect(() => {
    if (!restored) return;
    const flush = () => writeStored(STORAGE_KEY, persisted(pending.current));
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [restored]);

  const value = React.useMemo(() => ({ state, dispatch }), [state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = React.useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

export const failedSatelliteIds = (config: SimulationConfig, tS: number): Set<string> =>
  new Set(
    (config.failures ?? [])
      .filter((failure) => failure.start_s <= tS && tS < failure.end_s)
      .map((failure) => failure.satellite_id),
  );

export const allFailedIds = (config: SimulationConfig): Set<string> =>
  new Set((config.failures ?? []).map((failure) => failure.satellite_id));
