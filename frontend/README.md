# OrbitGuard frontend

Next.js App Router + Feature-Sliced Design, talking to the OrbitGuard API.

## Run

```bash
npm install
cp .env.example .env.local     # API_ORIGIN, defaults to http://localhost:8080
npm run dev                    # http://localhost:3000
```

The backend must be up (`docker compose up -d` from the repository root).
`next.config.ts` rewrites `/api/*` to `API_ORIGIN`, so the browser only ever
talks to its own origin and CORS never enters the picture.

```bash
npm run lint    # tsc --noEmit
npm run build
```

## Layer map

Imports point downward only: `app → views → widgets → features → entities → shared`.

```
src/
  app/        Next routes, providers (QueryClient + session), global styles
  views/      studio — the page that composes the three tabs
  widgets/    app-header, viewport, config-panel, network-health, playback-bar,
              satellite-details, critical-nodes, compare-board
  features/   select-scenario, configure-deployment, configure-planes,
              inject-failure, timeline-playback, analyze-resilience,
              run-optimizer, manage-variants, toggle-view
  entities/   scenario, simulation, satellite, ground-site, variant, session
  shared/     api (client, endpoints, wire types, query keys), ui, lib, config
```

Every slice exposes a public API through its `index.ts`; nothing reaches into
another slice's internals.

## Server state

TanStack Query owns everything that comes from the API. `entities/session`
owns what the user is manipulating — selected scenario, configuration
overrides, timeline position — and the simulation query is keyed on it, so
changing a slider is a cache lookup rather than a refetch once a configuration
has been seen.

Optimistic updates, each with rollback on error and an invalidate on settle:

| Action | What appears before the server answers |
|---|---|
| Inject failure | the satellite goes inactive, its links drop out of the snapshot, and any route through it clears |
| Save variant | the variant is in the list |
| Delete variant | the variant is gone |
| Import scenario | the scenario is in the picker |

## Design system

Not shadcn/ui. Tailwind v4 with a custom `@theme` token set in
`app/globals.css`, plus hand-written primitives in `shared/ui` that borrow
shadcn's shape — `cn()` over clsx + tailwind-merge, `forwardRef`, variant props
— without Radix, CVA or a `components.json`.

## WebGL

The globe needs WebGL. When a browser cannot give it one, `widgets/viewport`
catches the failure, switches to the flat map and says so, instead of taking the
whole page down with it.
