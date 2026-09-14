import type { NoRouteReason, RouteDto } from '@/shared/api';

export interface RouteTrace {
  clientId: string;
  available: boolean;
  path: string[];
  hops: number | null;
  reason: NoRouteReason | null;
  gatewayId: string | null;
  color: string;
  focused: boolean;
}

const ROUTE_COLORS = ['#3b82f6', '#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#facc15'];

export const routeColor = (index: number) => ROUTE_COLORS[index % ROUTE_COLORS.length];

export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildRouteTraces(
  routes: RouteDto[] | undefined,
  clientIds: string[],
  focusClientId: string | null,
): RouteTrace[] {
  if (!routes?.length) return [];

  const order = clientIds.length ? clientIds : routes.map((route) => route.client_id);

  return order.flatMap((clientId, index) => {
    const route = routes.find((item) => item.client_id === clientId);
    if (!route) return [];

    return [
      {
        clientId,
        available: route.available,
        path: route.path,
        hops: route.hops,
        reason: route.reason,
        gatewayId: route.gateway_id,
        color: routeColor(index),
        focused: clientId === focusClientId,
      },
    ];
  });
}

export interface RouteEdge {
  color: string;
  focused: boolean;
  clientId: string;
}



export function routeEdgeIndex(traces: RouteTrace[]): Map<string, RouteEdge> {
  const index = new Map<string, RouteEdge>();

  for (const trace of traces) {
    if (!trace.available) continue;

    for (let step = 0; step < trace.path.length - 1; step += 1) {
      const key = edgeKey(trace.path[step], trace.path[step + 1]);
      const existing = index.get(key);
      if (existing && existing.focused && !trace.focused) continue;
      index.set(key, { color: trace.color, focused: trace.focused, clientId: trace.clientId });
    }
  }

  return index;
}


export function routeNodeIndex(traces: RouteTrace[]): Map<string, RouteTrace[]> {
  const index = new Map<string, RouteTrace[]>();

  for (const trace of traces) {
    if (!trace.available) continue;

    for (const node of trace.path) {
      const bucket = index.get(node);
      if (bucket) bucket.push(trace);
      else index.set(node, [trace]);
    }
  }

  return index;
}

export const tracesThrough = (traces: RouteTrace[], nodeId: string): RouteTrace[] =>
  traces.filter((trace) => trace.available && trace.path.includes(nodeId));
