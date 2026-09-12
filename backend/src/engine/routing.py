from __future__ import annotations

import heapq
from collections import deque
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class RoutingStrategy(StrEnum):
    MIN_HOPS = "min_hops"
    MIN_DISTANCE = "min_distance"


class NoRouteReason(StrEnum):
    NO_VISIBLE_SATELLITE = "no_visible_satellite"
    NETWORK_PARTITION = "network_partition"
    NO_GATEWAY_CONTACT = "no_gateway_contact"
    GATEWAY_UNAVAILABLE = "gateway_unavailable"


@dataclass(frozen=True, slots=True)
class RouteResult:
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
    return node in graph.satellite_ids and node != origin


def _bfs(graph: NetworkGraph, origin: str) -> tuple[tuple[str, ...], float | None]:
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

    return NoRouteReason.NETWORK_PARTITION


def visible_satellites(graph: NetworkGraph, client_id: str) -> list[str]:
    return [n for n, _ in graph.neighbours(client_id) if n in graph.satellite_ids]
