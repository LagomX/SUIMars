from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DispatchWeights:
    distance: float = 0.35
    eta: float = 0.2
    rider_idle: float = 0.18
    fairness: float = 0.12
    demand_balance: float = 0.15


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def score_candidate(
    candidate: dict[str, Any],
    order: dict[str, Any],
    global_state: dict[str, Any],
    weights: DispatchWeights = DispatchWeights(),
) -> dict[str, Any]:
    distance_score = clamp(1 - candidate["distance_to_pickup_km"] / 6)
    eta_score = clamp(1 - (candidate["distance_to_pickup_km"] * 3 + global_state["traffic_level"] * 4) / 25)
    rider_idle_score = clamp(candidate["idle_time_min"] / 30)
    fairness_score = clamp(candidate["acceptance_rate"] - candidate["current_orders"] * 0.2)
    demand_balance_score = clamp(global_state["supply_demand_ratio"])

    dispatch_score = (
        weights.distance * distance_score
        + weights.eta * eta_score
        + weights.rider_idle * rider_idle_score
        + weights.fairness * fairness_score
        + weights.demand_balance * demand_balance_score
    )

    return {
        "rider_id": candidate["rider_id"],
        "order_id": order["order_id"],
        "dispatch_score": round(dispatch_score, 4),
        "components": {
            "distance_score": round(distance_score, 4),
            "eta_score": round(eta_score, 4),
            "rider_idle_score": round(rider_idle_score, 4),
            "fairness_score": round(fairness_score, 4),
            "demand_balance_score": round(demand_balance_score, 4),
        },
    }


def rank_candidates(dispatch_state: dict[str, Any], weights: DispatchWeights = DispatchWeights()) -> list[dict[str, Any]]:
    scored = [
        score_candidate(candidate, dispatch_state["order"], dispatch_state["global_state"], weights)
        for candidate in dispatch_state["candidate_riders"]
    ]
    return sorted(scored, key=lambda item: item["dispatch_score"], reverse=True)
