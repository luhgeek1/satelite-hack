# Backend Handoff Checklist

The code is marked with `TODO(BACKEND)` at every known temporary data boundary.
Use this document as the integration checklist before release.

## Replace Fixtures

- `src/mockData.ts`: orbital planes, inclination, ground sites, satellites,
  statuses, criticality, link topology, active route, and scenario metrics.
- `src/App.tsx`: default plane configuration, deterministic satellite movement,
  orbit-track generation, failure simulation, run-simulation delay, optimizer
  progress/recommendations, and comparison chart series.
- `src/components/Globe.tsx`: selected satellite coverage radius/beam profile.

## Expected Backend Capabilities

- Current constellation catalog, ephemeris, operational status and criticality.
- Ground-site catalog and current network topology/routes.
- Scenario creation, simulation progress, results and time-series metrics.
- Failure injection/restore workflow with recomputed topology and metrics.
- Optimizer job creation, progress updates and recommended plane changes.
- Per-satellite coverage or beam parameters for the globe footprint.

## Intentionally Local

- Sidebar visibility, collapsed groups, selected satellite and globe camera are
  persisted in browser `localStorage` as personal UI preferences. Move these to
  an account-preferences API only if cross-device persistence is required.
- Colors, animation timing, marker offsets and starfield settings are display
  decisions, not backend data.
