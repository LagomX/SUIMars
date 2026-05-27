"""
Load decrypted DataAsset JSON files produced by the Seal + Walrus batch decrypt step.

After fetch_assets.fetch_licensed_assets() runs, all blobs are already decrypted
by the TypeScript seal-access/src/batchDecrypt.ts script.  This module only reads
the resulting files — no cryptographic operations happen here.

Expected layout after batch decrypt:
    aggregator/output/buyer_workspace/decrypted_assets/
        consumer_demand/
            asset_consumer_001_consumer_demand.json
            ...
        merchant_operations/
            asset_merchant_001_merchant_operations.json
            ...
        rider_mobility/
            asset_rider_001_rider_mobility.json
            ...
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_decrypted_assets(
    buyer_dir: Path = Path("aggregator/output/buyer_workspace"),
) -> list[dict[str, Any]]:
    """
    Load all decrypted DataAsset JSON files from buyer_dir/decrypted_assets/.

    Returns a flat list of asset dicts, each with at minimum:
        asset_id, owner_id, role, data_type, contributors, events
    """
    decrypted_dir = buyer_dir / "decrypted_assets"

    if not decrypted_dir.exists():
        raise FileNotFoundError(
            f"Decrypted assets directory not found: {decrypted_dir}\n"
            "Run fetch_assets.fetch_licensed_assets() first."
        )

    asset_paths = sorted(decrypted_dir.glob("*/*.json"))
    if not asset_paths:
        raise ValueError(
            f"No decrypted asset files found under {decrypted_dir}. "
            "The batch-decrypt step may have produced zero assets."
        )

    assets: list[dict[str, Any]] = []
    for asset_path in asset_paths:
        try:
            asset = json.loads(asset_path.read_text())
        except (json.JSONDecodeError, OSError) as exc:
            raise ValueError(f"Could not read {asset_path}: {exc}") from exc

        if "data_type" not in asset or "events" not in asset:
            raise ValueError(
                f"{asset_path} is missing required fields (data_type, events). "
                "The blob may be corrupted or from an incompatible format."
            )

        assets.append(asset)

    return assets


def decrypt_licensed_assets(
    buyer_dir: Path = Path("aggregator/output/buyer_workspace"),
) -> list[dict[str, Any]]:
    """
    Convenience wrapper — load decrypted assets and print a summary.

    Crypto is handled by the TypeScript batch-decrypt script.  This function
    only reads the files that script already wrote to disk.
    """
    assets = load_decrypted_assets(buyer_dir)
    by_type: dict[str, int] = {}
    for asset in assets:
        by_type[asset["data_type"]] = by_type.get(asset["data_type"], 0) + 1

    print(f"Loaded {len(assets)} decrypted asset(s):")
    for data_type, count in sorted(by_type.items()):
        print(f"  {data_type}: {count}")

    return assets


if __name__ == "__main__":
    decrypted = decrypt_licensed_assets()
    print(f"\nTotal: {len(decrypted)} assets")
