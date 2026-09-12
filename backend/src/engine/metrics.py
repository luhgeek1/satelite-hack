from __future__ import annotations

from dataclasses import dataclass, field

from .routing import NoRouteReason


@dataclass(frozen=True, slots=True)
class OutageWindow:
    client_id: str
    start_s: int
    end_s: int
    reason: NoRouteReason | None
    leading: bool
    trailing: bool

    @property
    def duration_s(self) -> int:
        return self.end_s - self.start_s

    @property
    def bounded(self) -> bool:
        return not (self.leading or self.trailing)


@dataclass(frozen=True, slots=True)
class ClientMetrics:
    client_id: str
    steps: int
    visible_steps: int
    routed_steps: int
    visibility: float
    availability: float
    masked_steps: int
    masked_share: float
    max_outage_s: int
    max_bounded_outage_s: int
    leading_outage_s: int
    trailing_outage_s: int
    avg_hops: float | None
    min_hops: int | None
    max_hops: int | None
    meets_target: bool
    outage_windows: tuple[OutageWindow, ...] = field(default_factory=tuple)
    reason_counts: dict[str, int] = field(default_factory=dict)


def summarise_client(
    client_id: str,
    *,
    step_s: int,
    visible_flags: list[bool],
    routed_flags: list[bool],
    masked_flags: list[bool] | None = None,
    hop_counts: list[int | None],
    reasons: list[NoRouteReason | None],
    target_availability: float,
) -> ClientMetrics:
    steps = len(routed_flags)
    if steps == 0:
        raise ValueError("Cannot summarise an empty time grid")

    windows = _outage_windows(client_id, routed_flags, reasons, step_s)
    bounded = [w.duration_s for w in windows if w.bounded]
    leading = next((w.duration_s for w in windows if w.leading), 0)
    trailing = next((w.duration_s for w in windows if w.trailing), 0)

    hops = [h for h in hop_counts if h is not None]
    routed_steps = sum(routed_flags)
    availability = routed_steps / steps
    masked_steps = sum(masked_flags) if masked_flags else 0

    reason_counts: dict[str, int] = {}
    for reason in reasons:
        if reason is not None:
            reason_counts[reason.value] = reason_counts.get(reason.value, 0) + 1

    return ClientMetrics(
        client_id=client_id,
        steps=steps,
        visible_steps=sum(visible_flags),
        routed_steps=routed_steps,
        visibility=sum(visible_flags) / steps,
        availability=availability,
        masked_steps=masked_steps,
        masked_share=masked_steps / steps,
        max_outage_s=max((w.duration_s for w in windows), default=0),
        max_bounded_outage_s=max(bounded, default=0),
        leading_outage_s=leading,
        trailing_outage_s=trailing,
        avg_hops=(sum(hops) / len(hops)) if hops else None,
        min_hops=min(hops) if hops else None,
        max_hops=max(hops) if hops else None,
        meets_target=availability >= target_availability,
        outage_windows=tuple(windows),
        reason_counts=reason_counts,
    )


def _outage_windows(
    client_id: str,
    routed_flags: list[bool],
    reasons: list[NoRouteReason | None],
    step_s: int,
) -> list[OutageWindow]:
    windows: list[OutageWindow] = []
    steps = len(routed_flags)
    index = 0

    while index < steps:
        if routed_flags[index]:
            index += 1
            continue

        start = index
        while index < steps and not routed_flags[index]:
            index += 1
        end = index

        windows.append(
            OutageWindow(
                client_id=client_id,
                start_s=start * step_s,
                end_s=end * step_s,
                reason=_dominant_reason(reasons[start:end]),
                leading=start == 0,
                trailing=end == steps,
            )
        )

    return windows


def _dominant_reason(reasons: list[NoRouteReason | None]) -> NoRouteReason | None:
    counts: dict[NoRouteReason, int] = {}
    for reason in reasons:
        if reason is not None:
            counts[reason] = counts.get(reason, 0) + 1
    if not counts:
        return None
    return max(counts, key=lambda reason: (counts[reason], -reasons.index(reason)))


def worst_availability(metrics: dict[str, ClientMetrics]) -> float:
    return min((m.availability for m in metrics.values()), default=0.0)


def mean_availability(metrics: dict[str, ClientMetrics]) -> float:
    if not metrics:
        return 0.0
    return sum(m.availability for m in metrics.values()) / len(metrics)
