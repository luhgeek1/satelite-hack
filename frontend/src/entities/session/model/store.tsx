'use client';

import * as React from 'react';
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
}

type Action =
  | { type: 'selectScenario'; scenarioId: string }
  | { type: 'setLaunchStage'; stage: 1 | 2 | 3 }
  | { type: 'setPlane'; planeId: string; raanDeg?: number; phaseDeg?: number }
  | { type: 'applyPlanes'; planes: Record<string, { raan_deg?: number; phase_deg?: number }> }
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
  | { type: 'resetConfig' };

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
      };

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

    case 'selectSatellite':
      return {
        ...state,
        selectedSatelliteId: action.satelliteId,
        focusRequest:
          action.focus && action.satelliteId
            ? { id: action.satelliteId, nonce: Date.now() }
            : state.focusRequest,
      };

    case 'selectClient':
      return { ...state, selectedClientId: action.clientId };

    case 'setViewMode':
      return { ...state, viewMode: action.viewMode };

    case 'setTab':
      return { ...state, tab: action.tab };

    case 'resetConfig':
      return { ...state, config: {}, tS: 0, playing: false };

    default:
      return state;
  }
}

interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<Action>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
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
