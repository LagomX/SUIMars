from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def grid_distance(a: str, b: str) -> float:
    row_a, col_a = ord(a[3]) - ord("A"), int(a[4])
    row_b, col_b = ord(b[3]) - ord("A"), int(b[4])
    return round((((row_a - row_b) ** 2 + (col_a - col_b) ** 2) ** 0.5) * 1.1, 2)


def build_dispatch_rows(
    orders: list[dict[str, Any]],
    demand_rows: list[dict[str, Any]],
    max_rows: int = 500,
) -> list[dict[str, Any]]:
    demand_by_grid_window = {(row["grid_id"], row["window_start"]): row for row in demand_rows}
    by_window: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in demand_rows:
        by_window[row["window_start"]].append(row)

    rows: list[dict[str, Any]] = []
    candidate_pool = sorted({order["rider_id"] for order in orders})

    for order in orders[:max_rows]:
        window = max(
            (row["window_start"] for row in demand_rows if row["window_start"] <= order["created_at"]),
            default=demand_rows[0]["window_start"],
        )
        grid_state = demand_by_grid_window.get((order["pickup_grid"], window), demand_rows[0])
        candidates = []
        for index, rider_id in enumerate(candidate_pool[:8]):
            synthetic_grid = order["pickup_grid"] if rider_id == order["rider_id"] else f"SM_{chr(65 + index % 4)}{(index % 4) + 1}"
            candidates.append(
                {
                    "rider_id": rider_id,
                    "current_grid": synthetic_grid,
                    "distance_to_pickup_km": grid_distance(synthetic_grid, order["pickup_grid"]),
                    "idle_time_min": order["idle_time_min"] if rider_id == order["rider_id"] else 4 + index * 3,
                    "acceptance_rate": order["acceptance_rate"] if rider_id == order["rider_id"] else round(0.72 + index * 0.025, 2),
                    "current_orders": order["current_orders"] if rider_id == order["rider_id"] else index % 2,
                }
            )

        active = max(1, grid_state["active_riders"])
        rows.append(
            {
                "timestamp": order["created_at"],
                "order": {
                    "order_id": order["order_id"],
                    "pickup_grid": order["pickup_grid"],
                    "dropoff_grid": order["dropoff_grid"],
                    "merchant_prep_eta_min": round(order["prep_time_min"]),
                },
                "candidate_riders": candidates,
                "global_state": {
                    "predicted_demand_next_30min": grid_state["future_30min_order_count"],
                    "active_riders": grid_state["active_riders"],
                    "pending_orders": grid_state["pending_orders"],
                    "supply_demand_ratio": round(active / max(1, grid_state["pending_orders"] + grid_state["future_30min_order_count"]), 2),
                    "traffic_level": grid_state["traffic_level"],
                },
            }
        )

    return rows


def export_dispatch_dataset(
    orders_path: Path = Path("aggregator/output/merged_orders.json"),
    demand_path: Path = Path("aggregator/output/demand_prediction_dataset.json"),
    output_path: Path = Path("aggregator/output/dispatch_dataset.json"),
) -> list[dict[str, Any]]:
    orders = json.loads(orders_path.read_text())
    demand_rows = json.loads(demand_path.read_text())
    rows = build_dispatch_rows(orders, demand_rows)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(rows, indent=2) + "\n")
    return rows


if __name__ == "__main__":
    dataset = export_dispatch_dataset()
    print(f"Wrote {len(dataset)} dispatch states")
