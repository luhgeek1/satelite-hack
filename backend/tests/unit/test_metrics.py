import pytest

from engine.metrics import summarise_client
from engine.routing import NoRouteReason

pytestmark = pytest.mark.unit

STEP = 120


def summarise(routed, reasons=None, target=0.9):
    reasons = reasons or [None if flag else NoRouteReason.NETWORK_PARTITION for flag in routed]
    return summarise_client(
        "C1",
        step_s=STEP,
        visible_flags=[True] * len(routed),
        routed_flags=routed,
        hop_counts=[2 if flag else None for flag in routed],
        reasons=reasons,
        target_availability=target,
    )


def test_availability_is_a_fraction_of_instants():
    metrics = summarise([True] * 9 + [False])
    assert metrics.availability == pytest.approx(0.9)
    assert metrics.meets_target


def test_target_is_inclusive():
    assert summarise([True] * 9 + [False], target=0.9).meets_target


def test_max_outage_is_the_longest_run():
    metrics = summarise([True, False, True, False, False, False, True])
    assert metrics.max_outage_s == 3 * STEP


def test_edge_outages_are_reported_separately():
    metrics = summarise([False, False, True, False, False, False, True, False])
    assert metrics.leading_outage_s == 2 * STEP
    assert metrics.trailing_outage_s == 1 * STEP
    assert metrics.max_outage_s == 3 * STEP
    assert metrics.max_bounded_outage_s == 3 * STEP

    windows = metrics.outage_windows
    assert windows[0].leading and not windows[0].bounded
    assert windows[-1].trailing and not windows[-1].bounded


def test_no_outage_means_zero():
    metrics = summarise([True, True, True])
    assert metrics.max_outage_s == 0
    assert metrics.outage_windows == ()


def test_never_routed_is_one_window_spanning_everything():
    metrics = summarise([False] * 5)
    assert metrics.availability == 0.0
    assert len(metrics.outage_windows) == 1
    assert metrics.outage_windows[0].leading and metrics.outage_windows[0].trailing
    assert metrics.max_bounded_outage_s == 0


def test_reason_counts_are_tallied():
    reasons = [
        None,
        NoRouteReason.NO_VISIBLE_SATELLITE,
        NoRouteReason.NO_VISIBLE_SATELLITE,
        NoRouteReason.NETWORK_PARTITION,
    ]
    metrics = summarise([True, False, False, False], reasons=reasons)
    assert metrics.reason_counts == {"no_visible_satellite": 2, "network_partition": 1}
