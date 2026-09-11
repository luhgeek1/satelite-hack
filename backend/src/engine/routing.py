"""Route search across one network snapshot.

A snapshot is a plain undirected graph whose nodes are ground sites and
satellites. Two rules make it not-quite-a-textbook-graph, and both come straight
from the case:

* client ground sites are endpoints, never relays — a path may not hop through
  another village to reach the gateway;
* a path ends at *any* gateway that is currently up, so a scenario with several
  gateways is served by whichever is reachable.

When no path exists the case requires us to say which of four things went wrong,
so `find_route` classifies the failure instead of just returning `None`.
"""

from __future__ import annotations

import heapq
from collections import deque
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class RoutingStrategy(StrEnum):
    """How to pick among the paths that exist.

    `MIN_HOPS` is the default and the one the reference metrics were produced
    with: fewest relays is the honest reading of "маршрут" for a store-and-
    forward network, and it is stable under floating-point noise.
    `MIN_DISTANCE` exists so the Compare tab can show that the choice of metric
    changes the route but not the availability.
    """

    MIN_HOPS = "min_hops"
    MIN_DISTANCE = "min_distance"


class NoRouteReason(StrEnum):
    """The four causes the case asks the interface to distinguish."""

    NO_VISIBLE_SATELLITE = "no_visible_satellite"
    NETWORK_PARTITION = "network_partition"
    NO_GATEWAY_CONTACT = "no_gateway_contact"
    GATEWAY_UNAVAILABLE = "gateway_unavailable"


@dataclass(frozen=True, slots=True)
class RouteResult:
    """One client's outcome at one instant.

    `path` runs from the client id to the gateway id inclusive, so `hops` — the
    number of edges — counts both ground links, as the case defines it.
    """

    client_id: str
    path: tuple[str, ...]
    distance_km: float | None
    reason: NoRouteReason | None

    @property
    def available(self) -> bool:
        return bool(self.path)

    @property
    def hops(self) -> int | None:
        return len(self.path) - 1 if self.path else None

    @property
    def gateway_id(self) -> str | None:
        return self.path[-1] if self.path else None


@dataclass(slots=True)
class NetworkGraph:
    """Adjacency for one instant, with the node roles routing needs.

    Adjacency lists are sorted by (distance, neighbour id) so that a run is
    reproducible: two engineers comparing variants must not see different routes
    because a dict iterated differently.
    """

    adjacency: dict[str, list[tuple[str, float]]]
    client_ids: frozenset[str]
    gateway_ids: frozenset[str]
    online_gateway_ids: frozenset[str]
    satellite_ids: frozenset[str]

    def neighbours(self, node: str) -> Sequence[tuple[str, float]]:
        return self.adjacency.get(node, ())


def build_graph(
    edges: Iterable[Sequence[Any]],
    *,
    client_ids: Iterable[str],
    gateway_ids: Iterable[str],
    online_gateway_ids: Iterable[str],
    satellite_ids: Iterable[str],
) -> NetworkGraph:
    """Turn `geometry.snapshot()["edges"]` into a routable graph.

    `snapshot` already drops links belonging to failed satellites and to gateways
    that are in an outage window, so the edge list is taken at face value here.
    """
    adjacency: dict[str, list[tuple[str, float]]] = {}
    for edge in edges:
        a, b, distance = edge[0], edge[1], float(edge[2])
        adjacency.setdefault(a, []).append((b, distance))
        adjacency.setdefault(b, []).append((a, distance))

    for node in adjacency:
        adjacency[node].sort(key=lambda item: (item[1], item[0]))

    return NetworkGraph(
        adjacency=adjacency,
        client_ids=frozenset(client_ids),
        gateway_ids=frozenset(gateway_ids),
        online_gateway_ids=frozenset(online_gateway_ids),
        satellite_ids=frozenset(satellite_ids),
    )


def find_route(
    graph: NetworkGraph,
    client_id: str,
    strategy: RoutingStrategy = RoutingStrategy.MIN_HOPS,
) -> RouteResult:
    """Shortest path from `client_id` to any online gateway."""
    search = _bfs if strategy is RoutingStrategy.MIN_HOPS else _dijkstra
    path, distance = search(graph, client_id)

    if path:
        return RouteResult(client_id=client_id, path=path, distance_km=distance, reason=None)

    return RouteResult(
        client_id=client_id,
        path=(),
        distance_km=None,
        reason=_classify_failure(graph, client_id),
    )


def _expandable(graph: NetworkGraph, node: str, origin: str) -> bool:
    """May the search continue *through* this node?

    Only satellites relay. The origin client is where we started and gateways are
    terminal, so neither is ever expanded.
    """
    return node in graph.satellite_ids and node != origin


def _bfs(graph: NetworkGraph, origin: str) -> tuple[tuple[str, ...], float | None]:
    """Fewest hops. Neighbours are pre-sorted, so ties break on distance then id."""
    previous: dict[str, str | None] = {origin: None}
    queue: deque[str] = deque([origin])

    while queue:
        node = queue.popleft()
        for neighbour, _ in graph.neighbours(node):
            if neighbour in previous:
                continue
            previous[neighbour] = node
            if neighbour in graph.online_gateway_ids:
                return _reconstruct(previous, neighbour, graph)
            if _expandable(graph, neighbour, origin):
                queue.append(neighbour)

    return (), None


def _dijkstra(graph: NetworkGraph, origin: str) -> tuple[tuple[str, ...], float | None]:
    """Shortest total link distance, tie-broken on node id for determinism."""
    previous: dict[str, str | None] = {origin: None}
    best: dict[str, float] = {origin: 0.0}
    heap: list[tuple[float, str]] = [(0.0, origin)]
    settled: set[str] = set()

    while heap:
        cost, node = heapq.heappop(heap)
        if node in settled:
            continue
        settled.add(node)

        if node in graph.online_gateway_ids:
            return _reconstruct(previous, node, graph)

        if node != origin and not _expandable(graph, node, origin):
            continue

        for neighbour, distance in graph.neighbours(node):
            candidate = cost + distance
            if candidate < best.get(neighbour, float("inf")):
                best[neighbour] = candidate
                previous[neighbour] = node
                heapq.heappush(heap, (candidate, neighbour))

    return (), None


def _reconstruct(
    previous: Mapping[str, str | None],
    end: str,
    graph: NetworkGraph,
) -> tuple[tuple[str, ...], float]:
    path: list[str] = []
    node: str | None = end
    while node is not None:
        path.append(node)
        node = previous[node]
    path.reverse()

    total = 0.0
    for left, right in zip(path, path[1:], strict=False):
        for neighbour, distance in graph.neighbours(left):
            if neighbour == right:
                total += distance
                break

    return tuple(path), total


def _classify_failure(graph: NetworkGraph, client_id: str) -> NoRouteReason:
    """Say *why* there is no path, in the case's own four categories.

    Checked from the client outwards, so the answer names the first thing that is
    missing rather than the last: a village with no satellite overhead is told
    exactly that, even though the gateway also happens to be unreachable.
    """
    visible = [n for n, _ in graph.neighbours(client_id) if n in graph.satellite_ids]
    if not visible:
        return NoRouteReason.NO_VISIBLE_SATELLITE

    if not graph.online_gateway_ids:
        return NoRouteReason.GATEWAY_UNAVAILABLE

    gateway_has_contact = any(
        any(n in graph.satellite_ids for n, _ in graph.neighbours(gateway_id))
        for gateway_id in graph.online_gateway_ids
    )
    if not gateway_has_contact:
        return NoRouteReason.NO_GATEWAY_CONTACT

    # Both ends are healthy in isolation, so the satellite mesh between them is
    # what is broken.
    return NoRouteReason.NETWORK_PARTITION


def visible_satellites(graph: NetworkGraph, client_id: str) -> list[str]:
    """Satellites currently serving a ground site, nearest first."""
    return [n for n, _ in graph.neighbours(client_id) if n in graph.satellite_ids]
