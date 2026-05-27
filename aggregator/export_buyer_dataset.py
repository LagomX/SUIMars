from __future__ import annotations

import json
import shutil
from pathlib import Path


def export_buyer_dataset(
    output_dir: Path = Path("aggregator/output"),
    buyer_dataset_dir: Path = Path("aggregator/output/buyer_dataset"),
) -> dict[str, str]:
    buyer_dataset_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "demand_json": output_dir / "demand_prediction_dataset.json",
        "demand_csv": output_dir / "demand_prediction_dataset.csv",
        "dispatch_json": output_dir / "dispatch_dataset.json",
    }
    exported: dict[str, str] = {}
    for name, source in files.items():
        target = buyer_dataset_dir / source.name
        shutil.copy2(source, target)
        exported[name] = str(target)
    (buyer_dataset_dir / "manifest.json").write_text(json.dumps(exported, indent=2) + "\n")
    return exported


if __name__ == "__main__":
    paths = export_buyer_dataset()
    print(json.dumps(paths, indent=2))
