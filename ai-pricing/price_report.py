from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from score_asset import (
    BASE_PRICE_MICRO_USDC,
    MAX_PRICE_MICRO_USDC,
    MIN_PRICE_MICRO_USDC,
    score_asset,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_ASSETS_DIR = PROJECT_ROOT / "simulator" / "output" / "raw_assets"
SHARDS_DIR = PROJECT_ROOT / "walrus-uploader" / "output" / "shards"
OUTPUT_PATH = PROJECT_ROOT / "ai-pricing" / "output" / "pricing_report.json"
MODEL_VERSION = "rules-v1"


def load_raw_assets(raw_assets_dir: Path = RAW_ASSETS_DIR) -> list[dict[str, Any]]:
    if not raw_assets_dir.exists():
        raise FileNotFoundError(
            f"Raw assets directory not found: {raw_assets_dir}. "
            "Run pnpm simulator:generate first."
        )

    asset_paths = sorted(raw_assets_dir.glob("*/*.json"))
    if not asset_paths:
        raise ValueError(f"No raw asset JSON files found under {raw_assets_dir}")

    assets: list[dict[str, Any]] = []
    for asset_path in asset_paths:
        try:
            asset = json.loads(asset_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"Could not read {asset_path}: {exc}") from exc

        asset["_source_path"] = str(asset_path.relative_to(PROJECT_ROOT))
        assets.append(asset)

    return assets


def load_dataset_shards(shards_dir: Path = SHARDS_DIR) -> list[dict[str, Any]]:
    if not shards_dir.exists():
        return []

    shard_paths = sorted(shards_dir.glob("*.json"))
    shards: list[dict[str, Any]] = []
    for shard_path in shard_paths:
        try:
            shard = json.loads(shard_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"Could not read {shard_path}: {exc}") from exc

        shard["_source_path"] = str(shard_path.relative_to(PROJECT_ROOT))
        shards.append(shard)

    return shards


def shard_to_scoreable_asset(shard: dict[str, Any]) -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    for asset in shard.get("assets", []):
        if isinstance(asset, dict) and isinstance(asset.get("events"), list):
            events.extend(event for event in asset["events"] if isinstance(event, dict))

    return {
        "asset_id": shard["shard_id"],
        "owner_id": shard["shard_id"],
        "owner": "dataset_shard",
        "role": "aggregated",
        "data_type": shard["data_type"],
        "events": events,
    }


def build_report() -> dict[str, Any]:
    priced_assets = []
    shards = load_dataset_shards()
    source_assets = [shard_to_scoreable_asset(shard) | {"_source_path": shard["_source_path"]} for shard in shards]
    if not source_assets:
        source_assets = load_raw_assets()

    for asset in source_assets:
        priced = score_asset(asset)
        priced["source_path"] = asset["_source_path"]
        if "shard_id" not in priced and asset.get("role") == "aggregated":
            priced["shard_id"] = asset["asset_id"]
        priced_assets.append(priced)

    return {
        "model_version": MODEL_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "base_price_micro_usdc": BASE_PRICE_MICRO_USDC,
        "min_price_micro_usdc": MIN_PRICE_MICRO_USDC,
        "max_price_micro_usdc": MAX_PRICE_MICRO_USDC,
        "assets": priced_assets,
    }


def main() -> None:
    report = build_report()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=2) + "\n")

    by_type: dict[str, int] = {}
    for asset in report["assets"]:
        data_type = asset["data_type"]
        by_type[data_type] = by_type.get(data_type, 0) + 1

    print("AI pricing report generated")
    print(f"Model version : {report['model_version']}")
    print(f"Assets scored : {len(report['assets'])}")
    for data_type, count in sorted(by_type.items()):
        print(f"  {data_type}: {count}")
    print(f"Output        : {OUTPUT_PATH.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
