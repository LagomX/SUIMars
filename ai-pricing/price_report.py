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


def build_report() -> dict[str, Any]:
    priced_assets = []
    for asset in load_raw_assets():
        priced = score_asset(asset)
        priced["source_path"] = asset["_source_path"]
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
