import pytest

from engine.routing import (
    NoRouteReason,
    RoutingStrategy,
    build_graph,
    find_route,
)

pytestmark = pytest.mark.unit

CLIENTS = ["C1", "C2"]
GATEWAYS = ["G1"]
SATELLITES = ["S1", "S2", "S3"]


def graph(edges, *, online_gateways=None, satellites=None):
    return build_graph(
        edges,
        client_ids=CLIENTS,
        gateway_ids=GATEWAYS,
        online_gateway_ids=GATEWAYS if online_gateways is None else online_gateways,
        satellite_ids=SATELLITES if satellites is None else satellites,
    )


def test_finds_a_simple_route():
    result = find_route(graph([["C1", "S1", 800.0], ["S1", "G1", 900.0]]), "C1")
    assert result.path == ("C1", "S1", "G1")
    assert result.hops == 2  # both ground links count, per the case
    assert result.gateway_id == "G1"


def test_client_sites_never_relay():
    edges = [
        ["C1", "S1", 800.0],
        ["S1", "C2", 800.0],
        ["C2", "S2", 800.0],
        ["S2", "G1", 900.0],
    ]
    result = find_route(graph(edges), "C1")
    assert not result.available
    assert result.reason is NoRouteReason.NETWORK_PARTITION


def test_reason_no_visible_satellite():
    result = find_route(graph([["S1", "G1", 900.0]]), "C1")
    assert result.reason is NoRouteReason.NO_VISIBLE_SATELLITE


def test_reason_gateway_unavailable():
    edges = [["C1", "S1", 800.0], ["S1", "G1", 900.0]]
    result = find_route(graph(edges, online_gateways=[]), "C1")
    assert result.reason is NoRouteReason.GATEWAY_UNAVAILABLE


def test_reason_no_gateway_contact():
    edges = [["C1", "S1", 800.0], ["S1", "S2", 1500.0]]
    result = find_route(graph(edges), "C1")
    assert result.reason is NoRouteReason.NO_GATEWAY_CONTACT


def test_reason_network_partition():
    edges = [["C1", "S1", 800.0], ["S2", "G1", 900.0]]
    result = find_route(graph(edges), "C1")
    assert result.reason is NoRouteReason.NETWORK_PARTITION


def test_min_hops_and_min_distance_can_disagree():
    edges = [
        ["C1", "S1", 100.0],
        ["S1", "G1", 2900.0],
        ["S1", "S2", 100.0],
        ["S2", "S3", 100.0],
        ["S3", "G1", 100.0],
    ]
    by_hops = find_route(graph(edges), "C1", RoutingStrategy.MIN_HOPS)
    by_distance = find_route(graph(edges), "C1", RoutingStrategy.MIN_DISTANCE)

    assert by_hops.path == ("C1", "S1", "G1")
    assert by_distance.path == ("C1", "S1", "S2", "S3", "G1")
    assert by_hops.available and by_distance.available
    assert by_distance.distance_km < by_hops.distance_km


def test_routing_is_deterministic():
    edges = [
        ["C1", "S1", 800.0],
        ["C1", "S2", 800.0],
        ["S1", "G1", 900.0],
        ["S2", "G1", 900.0],
    ]
    paths = {find_route(graph(edges), "C1").path for _ in range(20)}
    assert len(paths) == 1
