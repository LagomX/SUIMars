"""
Mars buyer-side data aggregation pipeline.

End-to-end flow:
  1. fetch_assets   — Seal + Walrus decrypt all licensed DataAssets (TypeScript)
  2. decrypt_assets — Load resulting plaintext JSON files (Python)
  3. merge_events   — Merge rider + merchant + consumer events by order_id
  4. build_grid_time_dataset — 16-grid × 15-min demand prediction rows → CSV
  5. build_dispatch_dataset  — Dispatch candidate states for each order
  6. export_buyer_dataset    — Bundle datasets into aggregator/output/buyer_dataset/

Prerequisites (see README):
  pnpm simulator:wallets
  pnpm simulator:generate
  pnpm walrus:upload
  pnpm --dir contracts register:data-assets
  pnpm --dir contracts prepare:data-license

Run from the project root:
  python3 aggregator/main.py
"""

from __future__ import annotations

from pathlib import Path

from build_dispatch_dataset import export_dispatch_dataset
from build_grid_time_dataset import export_grid_time_dataset
from decrypt_assets import decrypt_licensed_assets
from export_buyer_dataset import export_buyer_dataset
from fetch_assets import fetch_licensed_assets
from merge_events import write_merged_orders


def main() -> None:
    buyer_dir = Path("aggregator/output/buyer_workspace")

    # ── Step 1: Decrypt all licensed DataAssets via Seal + Walrus ─────────────
    # Runs seal-access/src/batchDecrypt.ts which:
    #   - Proves DataLicense ownership to Seal key servers
    #   - Fetches encrypted blobs from Walrus
    #   - Decrypts with AES-256-GCM
    #   - Writes individual asset JSON files to buyer_workspace/decrypted_assets/
    manifest_entries = fetch_licensed_assets(buyer_dir)

    # ── Step 2: Load the decrypted plaintext files ────────────────────────────
    decrypted = decrypt_licensed_assets(buyer_dir)

    # ── Step 3: Merge rider + merchant + consumer events by order_id ──────────
    orders = write_merged_orders(buyer_dir)

    # ── Step 4: Build 16-grid × 15-min demand prediction dataset ─────────────
    demand_rows = export_grid_time_dataset()

    # ── Step 5: Build dispatch candidate dataset ──────────────────────────────
    dispatch_rows = export_dispatch_dataset()

    # ── Step 6: Package buyer-facing datasets ─────────────────────────────────
    exported = export_buyer_dataset()

    # ── Summary ───────────────────────────────────────────────────────────────
    total_raw_assets = sum(e.get("asset_count", 0) for e in manifest_entries)
    print("\nMars buyer-side aggregation complete")
    print(f"  DataAsset blobs decrypted : {len(manifest_entries)}")
    print(f"  Individual assets loaded  : {len(decrypted)}  (from {total_raw_assets} raw)")
    print(f"  Merged complete orders    : {len(orders)}")
    print(f"  Demand prediction rows    : {len(demand_rows)}")
    print(f"  Dispatch states           : {len(dispatch_rows)}")
    print(f"  Buyer dataset             : {exported}")


if __name__ == "__main__":
    main()
