from __future__ import annotations

from pathlib import Path

from build_dispatch_dataset import export_dispatch_dataset
from build_grid_time_dataset import export_grid_time_dataset
from decrypt_assets import decrypt_licensed_assets
from export_buyer_dataset import export_buyer_dataset
from fetch_assets import fetch_licensed_assets
from merge_events import write_merged_orders


def main() -> None:
    simulator_output = Path("simulator/output")
    buyer_dir = Path("aggregator/output/buyer_workspace")

    fetched = fetch_licensed_assets(simulator_output, buyer_dir)
    decrypted = decrypt_licensed_assets(buyer_dir, simulator_output)
    orders = write_merged_orders(buyer_dir)
    demand_rows = export_grid_time_dataset()
    dispatch_rows = export_dispatch_dataset()
    exported = export_buyer_dataset()

    print("Mars buyer-side aggregation complete")
    print(f"Licensed encrypted assets fetched: {len(fetched)}")
    print(f"Decrypted DataAssets: {len(decrypted)}")
    print(f"Merged orders: {len(orders)}")
    print(f"Demand prediction rows: {len(demand_rows)}")
    print(f"Dispatch states: {len(dispatch_rows)}")
    print(f"Buyer dataset manifest: {exported}")


if __name__ == "__main__":
    main()
