from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from decrypt_assets import load_decrypted_assets  # validated loader — avoids duplication


def merge_events_by_order(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    orders: dict[str, dict[str, Any]] = {}

    for asset in assets:
        data_type = asset["data_type"]
        for event in asset["events"]:
            order = orders.setdefault(event["order_id"], {"order_id": event["order_id"]})
            if data_type == "consumer_behavior":
                order.update(
                    {
                        "consumer_id": event["consumer_id"],
                        "created_at": event["timestamp"],
                        "pickup_grid": event["pickup_grid"],
                        "dropoff_grid": event["dropoff_grid"],
                        "order_value": event["order_value"],
                        "merchant_category": event["merchant_category"],
                    }
                )
            elif data_type == "merchant_operations":
                order.update(
                    {
                        "merchant_id": event["merchant_id"],
                        "ready_at": event["timestamp"],
                        "prep_time_min": event["prep_time_min"],
                    }
                )
            elif data_type == "rider_mobility":
                rider_events = order.setdefault("rider_events", [])
                rider_events.append(event)
                if event["event_type"] == "accepted":
                    order.update(
                        {
                            "rider_id": event["rider_id"],
                            "accepted_at": event["timestamp"],
                            "accept_grid": event["grid_id"],
                            "accept_lat": event["lat"],
                            "accept_lng": event["lng"],
                            "idle_time_min": event["idle_time_min"],
                            "acceptance_rate": event["acceptance_rate"],
                            "current_orders": event["current_orders"],
                        }
                    )
                elif event["event_type"] == "delivered":
                    order.update(
                        {
                            "delivered_at": event["timestamp"],
                            "delivery_duration_min": event.get("delivery_duration_min"),
                        }
                    )

    complete = [
        order
        for order in orders.values()
        if {"created_at", "ready_at", "accepted_at", "delivered_at", "pickup_grid", "dropoff_grid"} <= set(order)
    ]
    return sorted(complete, key=lambda item: item["created_at"])


def write_merged_orders(
    buyer_dir: Path = Path("aggregator/output/buyer_workspace"),
    output_path: Path = Path("aggregator/output/merged_orders.json"),
) -> list[dict[str, Any]]:
    assets = load_decrypted_assets(buyer_dir)
    orders = merge_events_by_order(assets)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(orders, indent=2) + "\n")
    return orders


if __name__ == "__main__":
    merged = write_merged_orders()
    print(f"Merged {len(merged)} complete orders")
