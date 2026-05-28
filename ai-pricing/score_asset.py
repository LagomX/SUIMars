from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import sqrt
from typing import Any, Callable


BASE_PRICE_MICRO_USDC = 100_000
MIN_PRICE_MICRO_USDC = 25_000
MAX_PRICE_MICRO_USDC = 500_000


@dataclass(frozen=True)
class PricingConfig:
    event_weight: float
    coverage_weight: float
    consistency_weight: float
    event_threshold: int
    role_multiplier: float


PRICING_CONFIG: dict[str, PricingConfig] = {
    "rider_mobility": PricingConfig(
        event_weight=0.30,
        coverage_weight=0.40,
        consistency_weight=0.30,
        event_threshold=320,
        role_multiplier=1.5,
    ),
    "merchant_operations": PricingConfig(
        event_weight=0.40,
        coverage_weight=0.30,
        consistency_weight=0.30,
        event_threshold=400,
        role_multiplier=1.2,
    ),
    "consumer_behavior": PricingConfig(
        event_weight=0.35,
        coverage_weight=0.35,
        consistency_weight=0.30,
        event_threshold=35,
        role_multiplier=1.0,
    ),
}


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def parse_day(timestamp: str) -> str | None:
    try:
        return datetime.fromisoformat(timestamp.replace("Z", "+00:00")).date().isoformat()
    except (TypeError, ValueError):
        return None


def numeric_values(events: list[dict[str, Any]], field: str) -> list[float]:
    values: list[float] = []
    for event in events:
        value = event.get(field)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            values.append(float(value))
    return values


def metric_score(values: list[float]) -> float | None:
    if len(values) < 2:
        return None

    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    std_dev = sqrt(variance)

    if mean == 0:
        return 100.0 if std_dev == 0 else 0.0

    cv = std_dev / abs(mean)
    return max(0.0, 100.0 * (1.0 - min(cv, 1.0)))


def event_count_score(event_count: int, threshold: int) -> float:
    return clamp((event_count / threshold) * 100.0, 0.0, 100.0)


def coverage_score(data_type: str, events: list[dict[str, Any]]) -> tuple[float, dict[str, Any]]:
    grids = {event.get("grid_id") for event in events if isinstance(event.get("grid_id"), str)}
    days = {
        day
        for day in (parse_day(event.get("timestamp")) for event in events)
        if day is not None
    }

    grid_score = clamp((len(grids) / 8) * 100.0, 0.0, 100.0)
    day_score = clamp((len(days) / 7) * 100.0, 0.0, 100.0)

    if data_type == "merchant_operations":
        score = day_score
    else:
        score = (0.6 * grid_score) + (0.4 * day_score)

    return score, {
        "unique_grid_count": len(grids),
        "unique_day_count": len(days),
        "grid_score": round(grid_score, 2),
        "day_score": round(day_score, 2),
    }


def rider_metric_extractors(events: list[dict[str, Any]]) -> dict[str, list[float]]:
    delivered = [event for event in events if event.get("event_type") == "delivered"]
    accepted = [event for event in events if event.get("event_type") == "accepted"]
    return {
        "acceptance_rate": numeric_values(events, "acceptance_rate"),
        "speed_kmh": numeric_values(events, "speed_kmh"),
        "delivery_duration_min": numeric_values(delivered, "delivery_duration_min"),
        "idle_time_min": numeric_values(accepted, "idle_time_min"),
    }


def consistency_score(data_type: str, events: list[dict[str, Any]]) -> tuple[float, dict[str, Any]]:
    extractors: dict[str, Callable[[list[dict[str, Any]]], dict[str, list[float]]]] = {
        "rider_mobility": rider_metric_extractors,
        "merchant_operations": lambda items: {"prep_time_min": numeric_values(items, "prep_time_min")},
        "consumer_behavior": lambda items: {"order_value": numeric_values(items, "order_value")},
    }

    metric_values = extractors[data_type](events)
    metric_scores: dict[str, float] = {}
    metric_counts: dict[str, int] = {}

    for metric, values in metric_values.items():
        score = metric_score(values)
        metric_counts[metric] = len(values)
        if score is not None:
            metric_scores[metric] = round(score, 2)

    if not metric_scores:
        return 60.0, {
            "metric_scores": {},
            "metric_counts": metric_counts,
            "fallback": "no_metric_with_at_least_two_values",
        }

    return sum(metric_scores.values()) / len(metric_scores), {
        "metric_scores": metric_scores,
        "metric_counts": metric_counts,
    }


def score_asset(asset: dict[str, Any]) -> dict[str, Any]:
    data_type = asset.get("data_type")
    if data_type not in PRICING_CONFIG:
        raise ValueError(f"Unsupported data_type for pricing: {data_type}")

    events = asset.get("events")
    if not isinstance(events, list):
        raise ValueError(f"{asset.get('asset_id', '<unknown>')} is missing events array")

    config = PRICING_CONFIG[data_type]
    event_count = len(events)
    event_score = event_count_score(event_count, config.event_threshold)
    coverage, coverage_signals = coverage_score(data_type, events)
    consistency, consistency_signals = consistency_score(data_type, events)

    quality = (
        event_score * config.event_weight
        + coverage * config.coverage_weight
        + consistency * config.consistency_weight
    )
    quality_score = int(round(clamp(quality, 1.0, 100.0)))

    raw_price = BASE_PRICE_MICRO_USDC * (quality_score / 100.0) * config.role_multiplier
    price_micro_usdc = int(round(clamp(raw_price, MIN_PRICE_MICRO_USDC, MAX_PRICE_MICRO_USDC)))

    return {
        "asset_id": asset.get("asset_id"),
        "owner_id": asset.get("owner_id"),
        "owner": asset.get("owner"),
        "role": asset.get("role"),
        "data_type": data_type,
        "quality_score": quality_score,
        "price_micro_usdc": price_micro_usdc,
        "signals": {
            "event_count": event_count,
            "event_threshold": config.event_threshold,
            "event_count_score": round(event_score, 2),
            "coverage_score": round(coverage, 2),
            "consistency_score": round(consistency, 2),
            **coverage_signals,
            **consistency_signals,
        },
    }
