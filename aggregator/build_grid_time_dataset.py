from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


WINDOW_MINUTES = 15
GRID_IDS = [f"SM_{row}{col}" for row in "ABCD" for col in range(1, 5)]


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def floor_window(dt: datetime) -> datetime:
    minute = (dt.minute // WINDOW_MINUTES) * WINDOW_MINUTES
    return dt.replace(minute=minute, second=0, microsecond=0)


def minutes_between(start: str, end: str) -> float:
    return (parse_ts(end) - parse_ts(start)).total_seconds() / 60


def traffic_level(hour: int, grid_id: str) -> float:
    commute = math.exp(-((hour - 8) ** 2) / 8) + math.exp(-((hour - 17) ** 2) / 8)
    grid_bias = 0.08 if grid_id in {"SM_C3", "SM_C4", "SM_D3", "SM_D4"} else 0.0
    return round(min(1.0, 0.25 + 0.28 * commute + grid_bias), 2)


def weather_code(day_of_week: int) -> int:
    return 1 if day_of_week in {1, 4} else 0


def build_grid_time_rows(orders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not orders:
        return []

    start = floor_window(min(parse_ts(order["created_at"]) for order in orders))
    end = start + timedelta(days=7)
    window_count = int((end - start).total_seconds() / (WINDOW_MINUTES * 60))

    by_window_grid: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    active_by_window_grid: dict[tuple[str, str], set[str]] = defaultdict(set)
    pending_by_window_grid: dict[tuple[str, str], int] = defaultdict(int)

    for order in orders:
        created_at = parse_ts(order["created_at"])
        accepted_at = parse_ts(order["accepted_at"])
        delivered_at = parse_ts(order["delivered_at"])
        key = (iso(floor_window(created_at)), order["pickup_grid"])
        by_window_grid[key].append(order)

        first_active = max(start, floor_window(accepted_at))
        last_active = min(end - timedelta(minutes=WINDOW_MINUTES), floor_window(delivered_at))
        current = first_active
        while current <= last_active:
            active_by_window_grid[(iso(current), order["pickup_grid"])].add(order["rider_id"])
            current += timedelta(minutes=WINDOW_MINUTES)

        first_pending = floor_window(created_at)
        last_pending = min(end - timedelta(minutes=WINDOW_MINUTES), floor_window(delivered_at))
        current = first_pending
        while current <= last_pending:
            window_end = current + timedelta(minutes=WINDOW_MINUTES)
            if created_at <= window_end and delivered_at > window_end:
                pending_by_window_grid[(iso(current), order["pickup_grid"])] += 1
            current += timedelta(minutes=WINDOW_MINUTES)

    rows: list[dict[str, Any]] = []
    for window_index in range(window_count):
        window_start = start + timedelta(minutes=WINDOW_MINUTES * window_index)
        window_key = iso(window_start)
        hour = window_start.hour
        dow = window_start.weekday()

        for grid_id in GRID_IDS:
            current_orders = by_window_grid.get((window_key, grid_id), [])
            previous_1 = by_window_grid.get((iso(window_start - timedelta(minutes=WINDOW_MINUTES)), grid_id), [])
            previous_2 = by_window_grid.get((iso(window_start - timedelta(minutes=WINDOW_MINUTES * 2)), grid_id), [])
            future_1 = by_window_grid.get((iso(window_start + timedelta(minutes=WINDOW_MINUTES)), grid_id), [])
            future_2 = by_window_grid.get((iso(window_start + timedelta(minutes=WINDOW_MINUTES * 2)), grid_id), [])
            active_riders = active_by_window_grid.get((window_key, grid_id), set())
            pending_count = pending_by_window_grid.get((window_key, grid_id), 0)
            merchant_count = len({order["merchant_id"] for order in current_orders}) or len(
                {order["merchant_id"] for order in previous_1 + previous_2}
            )

            rows.append(
                {
                    "grid_id": grid_id,
                    "window_start": window_key,
                    "window_minutes": WINDOW_MINUTES,
                    "order_count_t0": len(current_orders),
                    "order_count_t_minus_1": len(previous_1),
                    "order_count_t_minus_2": len(previous_2),
                    "active_riders": len(active_riders),
                    "available_riders": max(0, len(active_riders) - pending_count),
                    "pending_orders": pending_count,
                    "avg_accept_delay_min": round(
                        sum(minutes_between(order["created_at"], order["accepted_at"]) for order in current_orders)
                        / max(1, len(current_orders)),
                        2,
                    ),
                    "avg_prep_time_min": round(
                        sum(order["prep_time_min"] for order in current_orders) / max(1, len(current_orders)),
                        2,
                    ),
                    "avg_delivery_duration_min": round(
                        sum(order["delivery_duration_min"] or 0 for order in current_orders) / max(1, len(current_orders)),
                        2,
                    ),
                    "merchant_count": merchant_count,
                    "merchant_density": round(merchant_count / 15, 2),
                    "traffic_level": traffic_level(hour, grid_id),
                    "weather_code": weather_code(dow),
                    "hour_of_day": hour,
                    "day_of_week": dow,
                    "is_weekend": dow >= 5,
                    "future_30min_order_count": len(future_1) + len(future_2),
                }
            )

    return rows


def export_grid_time_dataset(
    orders_path: Path = Path("aggregator/output/merged_orders.json"),
    json_path: Path = Path("aggregator/output/demand_prediction_dataset.json"),
    csv_path: Path = Path("aggregator/output/demand_prediction_dataset.csv"),
) -> list[dict[str, Any]]:
    orders = json.loads(orders_path.read_text())
    rows = build_grid_time_rows(orders)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(rows, indent=2) + "\n")
    with csv_path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return rows


if __name__ == "__main__":
    dataset = export_grid_time_dataset()
    print(f"Wrote {len(dataset)} grid-time demand rows")
