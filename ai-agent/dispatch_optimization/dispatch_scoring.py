from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# ── Physical constants ─────────────────────────────────────────────────────────
# Used to convert distance → ETA in minutes.  18 km/h is a realistic urban
# delivery speed that accounts for traffic lights and dismount time.
URBAN_SPEED_KMH: float = 18.0

# Pickup ETA beyond this threshold (minutes) is unacceptable; score → 0.
# At 18 km/h through light traffic: 25 min ≈ 7.5 km — well beyond any grid.
MAX_ETA_MIN: float = 25.0

# Idle time beyond this value is treated as "fully available" (score → 1).
MAX_IDLE_MIN: float = 30.0


# ── Configurable weights ───────────────────────────────────────────────────────

@dataclass(frozen=True)
class DispatchWeights:
    """Weights for the dispatch scoring formula.  Must sum to 1.0.

    proximity     — ETA to pickup (distance + traffic).  Single factor replacing
                    the old distance_score + eta_score double-count.
    rider_idle    — prefer riders who have been idle longer (more available).
    fairness      — prefer riders with fewer orders in the current session.
    demand_balance — prefer riders currently in low-demand grids (so they can
                    be moved toward higher-demand areas via dispatch).
    """
    proximity:      float = 0.40
    rider_idle:     float = 0.18
    fairness:       float = 0.17
    demand_balance: float = 0.25
    # Verification: 0.40 + 0.18 + 0.17 + 0.25 = 1.00

    def __post_init__(self) -> None:
        total = self.proximity + self.rider_idle + self.fairness + self.demand_balance
        if abs(total - 1.0) > 1e-9:
            raise ValueError(
                f"DispatchWeights must sum to 1.0, got {total:.10f}. "
                f"(proximity={self.proximity}, rider_idle={self.rider_idle}, "
                f"fairness={self.fairness}, demand_balance={self.demand_balance})"
            )


# ── Helpers ────────────────────────────────────────────────────────────────────

def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


# ── Per-candidate scoring ──────────────────────────────────────────────────────

def score_candidate(
    candidate: dict[str, Any],
    order: dict[str, Any],
    global_state: dict[str, Any],
    weights: DispatchWeights = DispatchWeights(),
    max_session_orders: int = 0,
) -> dict[str, Any]:
    """Score one candidate rider for a given order.

    Args:
        candidate:         Rider state from the dispatch dataset.
        order:             Order to be dispatched.
        global_state:      Grid-level supply/demand context for the current window.
        weights:           Configurable scoring weights.
        max_session_orders: Maximum orders_in_session across all candidates in this
                           batch — used to normalise the fairness score.
    """

    # ── proximity_score ────────────────────────────────────────────────────────
    # ETA estimate (minutes) = distance / speed * traffic_multiplier.
    # Traffic multiplier: traffic_level ∈ [0, 1] → 1x–2x slowdown.
    # This replaces the old distance_score + eta_score pair that both used
    # distance_to_pickup_km, causing ~55% of the score to be double-counted.
    eta_min = (
        candidate["distance_to_pickup_km"] / URBAN_SPEED_KMH * 60.0
        * (1.0 + global_state["traffic_level"])
    )
    proximity_score = clamp(1.0 - eta_min / MAX_ETA_MIN)

    # ── rider_idle_score ───────────────────────────────────────────────────────
    # Riders who have been idle longer are more likely to accept and less
    # likely to be mid-delivery.  Saturates at MAX_IDLE_MIN.
    rider_idle_score = clamp(candidate["idle_time_min"] / MAX_IDLE_MIN)

    # ── fairness_score ─────────────────────────────────────────────────────────
    # Prefer riders who have received fewer orders in this dispatch session.
    # This provides dynamic load balancing across riders — not just static
    # acceptance_rate, which the old formula used (mislabelled as "fairness").
    orders_in_session = candidate.get("orders_in_session", 0)
    if max_session_orders > 0:
        fairness_score = clamp(1.0 - orders_in_session / max_session_orders)
    else:
        fairness_score = 1.0   # first order in session — all riders equally fair

    # ── demand_balance_score ───────────────────────────────────────────────────
    # Prefer dispatching riders who are currently in LOW-demand grids.
    # A rider sitting in a high-demand area should be saved for local orders;
    # a rider in a quiet area benefits from being sent to where demand is higher.
    #
    # Old formula: clamp(global_state["supply_demand_ratio"]) — a single global
    # constant, identical for every candidate → zero discriminating power.
    grid_demand_map: dict[str, int] = global_state.get("grid_demand_map", {})
    rider_grid_demand = grid_demand_map.get(candidate["current_grid"], 0)
    max_grid_demand = max(grid_demand_map.values()) if grid_demand_map else 1
    demand_balance_score = clamp(1.0 - rider_grid_demand / max(1, max_grid_demand))

    # ── Weighted sum ───────────────────────────────────────────────────────────
    dispatch_score = (
        weights.proximity      * proximity_score
        + weights.rider_idle   * rider_idle_score
        + weights.fairness     * fairness_score
        + weights.demand_balance * demand_balance_score
    )

    return {
        "rider_id": candidate["rider_id"],
        "order_id": order["order_id"],
        "dispatch_score": round(dispatch_score, 4),
        "components": {
            "proximity_score":      round(proximity_score, 4),
            "rider_idle_score":     round(rider_idle_score, 4),
            "fairness_score":       round(fairness_score, 4),
            "demand_balance_score": round(demand_balance_score, 4),
        },
    }


# ── Ranking ────────────────────────────────────────────────────────────────────

def rank_candidates(
    dispatch_state: dict[str, Any],
    weights: DispatchWeights = DispatchWeights(),
) -> list[dict[str, Any]]:
    """Score and rank all candidate riders for a dispatch state.

    Computes max_session_orders across all candidates so fairness_score can be
    normalised consistently within the batch.
    """
    candidates = dispatch_state["candidate_riders"]
    max_session_orders = max(
        (c.get("orders_in_session", 0) for c in candidates),
        default=0,
    )
    scored = [
        score_candidate(
            c,
            dispatch_state["order"],
            dispatch_state["global_state"],
            weights,
            max_session_orders,
        )
        for c in candidates
    ]
    return sorted(scored, key=lambda item: item["dispatch_score"], reverse=True)
