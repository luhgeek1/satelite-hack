'use client';

import * as React from 'react';
import { isFiniteNumber, isRecord, readStored, writeStored } from '@/shared/lib';
import type {
  FailureDto,
  GatewayOutageDto,
  RoutingStrategy,
  SimulationConfig,
  SiteConditionsDto,
} from '@/shared/api';

export type StudioTab = 'simulation' | 'resilience' | 'compare';


export interface OutageSpan {
  startS: number;
  endS: number;
}






const clashes = (start: number, end: number, span: OutageSpan | undefined) =>
  span === undefined || (start < span.endS && end > span.startS);
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

  commitNonce: number;

  resetNonce: number;

  compareSlots: [string | null, string | null];










  committedStages: number[];
}

type Action =
  | { type: 'selectScenario'; scenarioId: string }
  | { type: 'setLaunchStage'; stage: 1 | 2 | 3 }
  | { type: 'setPlane'; planeId: string; raanDeg?: number; phaseDeg?: number }
  | { type: 'applyPlanes'; planes: Record<string, { raan_deg?: number; phase_deg?: number }> }
  | { type: 'commitConfig' }
  | { type: 'addFailure'; failure: FailureDto }


  | { type: 'removeFailure'; satelliteId: string; window?: OutageSpan }
  | { type: 'clearFailures' }

  | { type: 'clearOutagesIn'; window: OutageSpan }
  | { type: 'addGatewayOutage'; outage: GatewayOutageDto }
  | { type: 'removeGatewayOutage'; gatewayId: string; window?: OutageSpan }
  | { type: 'setSiteConditions'; siteId: string; conditions: SiteConditionsDto | null }
  | { type: 'resetSiteConditions'; siteId: string }
  | { type: 'setStrategy'; strategy: RoutingStrategy }
  | { type: 'seek'; tS: number }
  | { type: 'advance'; stepS: number; horizonS: number }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'setSpeed'; speed: number }
  | { type: 'selectSatellite'; satelliteId: string | null; focus?: boolean }
  | { type: 'selectClient'; clientId: string | null }
  | { type: 'setViewMode'; viewMode: ViewMode }
  | { type: 'setTab'; tab: StudioTab }
  | { type: 'setCompareSlots'; slots: [string | null, string | null] }
  | { type: 'commitStage'; stage: number }
  | { type: 'releaseStage'; stage: number }
  | { type: 'openVariant'; scenarioId: string; config: SimulationConfig; strategy: RoutingStrategy }
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
  resetNonce: 0,
  compareSlots: [null, null],
  committedStages: [],
};

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'selectScenario':
      return {
        ...state,
        scenarioId: action.scenarioId,
        config: {},
        committedStages: [],
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




    case 'commitConfig':
      return { ...state, commitNonce: state.commitNonce + 1 };

    case 'addFailure': {
      const failures = (state.config.failures ?? []).filter(
        (failure) =>
          failure.satellite_id !== action.failure.satellite_id
          || !clashes(failure.start_s, failure.end_s, {
            startS: action.failure.start_s,
            endS: action.failure.end_s,
          }),
      );
      return { ...state, config: { ...state.config, failures: [...failures, action.failure] } };
    }

    case 'removeFailure':
      return {
        ...state,
        config: {
          ...state.config,
          failures: (state.config.failures ?? []).filter(
            (failure) =>
              failure.satellite_id !== action.satelliteId
              || !clashes(failure.start_s, failure.end_s, action.window),
          ),
        },
      };

    case 'clearFailures':
      return { ...state, config: { ...state.config, failures: [] } };

    case 'clearOutagesIn':
      return {
        ...state,
        config: {
          ...state.config,
          failures: (state.config.failures ?? []).filter(
            (failure) => !clashes(failure.start_s, failure.end_s, action.window),
          ),
          gateway_outages: (state.config.gateway_outages ?? []).filter(
            (outage) => !clashes(outage.start_s, outage.end_s, action.window),
          ),
        },
      };

    case 'addGatewayOutage': {
      const outages = (state.config.gateway_outages ?? []).filter(
        (outage) =>
          outage.gateway_id !== action.outage.gateway_id
          || !clashes(outage.start_s, outage.end_s, {
            startS: action.outage.start_s,
            endS: action.outage.end_s,
          }),
      );
      return {
        ...state,
        config: { ...state.config, gateway_outages: [...outages, action.outage] },
      };
    }

    case 'removeGatewayOutage':
      return {
        ...state,
        config: {
          ...state.config,
          gateway_outages: (state.config.gateway_outages ?? []).filter(
            (outage) =>
              outage.gateway_id !== action.gatewayId
              || !clashes(outage.start_s, outage.end_s, action.window),
          ),
        },
      };


    case 'setSiteConditions':
      return {
        ...state,
        config: {
          ...state.config,
          sites: { ...state.config.sites, [action.siteId]: action.conditions },
        },
      };


    case 'resetSiteConditions': {
      const sites = { ...state.config.sites };
      delete sites[action.siteId];
      return { ...state, config: { ...state.config, sites } };
    }

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

    case 'setCompareSlots':
      return { ...state, compareSlots: action.slots };

    case 'commitStage':
      return state.committedStages.includes(action.stage)
        ? state
        : {
            ...state,
            committedStages: [...state.committedStages, action.stage].sort((a, b) => a - b),
          };

    case 'releaseStage':
      return {
        ...state,
        committedStages: state.committedStages.filter((stage) => stage !== action.stage),
      };



    case 'openVariant':
      return {
        ...state,
        scenarioId: action.scenarioId,
        config: action.config,
        committedStages: [],
        strategy: action.strategy,
        tab: 'simulation',
        tS: 0,
        playing: false,
        selectedSatelliteId: null,
      };

    case 'resetConfig':
      return {
        ...state,
        config: {},
        committedStages: [],
        tS: 0,
        playing: false,
        resetNonce: state.resetNonce + 1,
      };




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
  | 'compareSlots'
  | 'committedStages'
>;

const TABS: StudioTab[] = ['simulation', 'resilience', 'compare'];
const VIEW_MODES: ViewMode[] = ['3d', '2d'];

const isSession = (value: unknown): value is Partial<PersistedSession> => {
  if (!isRecord(value)) return false;
  const { scenarioId, config, tS, selectedSatelliteId, selectedClientId, viewMode, tab, compareSlots, committedStages } = value;
  if (
    committedStages !== undefined
    && !(Array.isArray(committedStages) && committedStages.every(isFiniteNumber))
  ) {
    return false;
  }
  if (
    compareSlots !== undefined
    && !(
      Array.isArray(compareSlots)
      && compareSlots.length === 2
      && compareSlots.every((slot) => slot === null || typeof slot === 'string')
    )
  ) {
    return false;
  }
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
  compareSlots: state.compareSlots,
  committedStages: state.committedStages,
});

interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<Action>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [restored, setRestored] = React.useState(false);




  React.useEffect(() => {
    const saved = readStored(STORAGE_KEY, isSession);
    if (saved) dispatch({ type: 'restore', state: saved });
    setRestored(true);
  }, []);









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
