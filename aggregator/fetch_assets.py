from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


def load_manifest(simulator_output: Path) -> list[dict[str, Any]]:
    manifest_path = simulator_output / "license_manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing license manifest: {manifest_path}")
    return json.loads(manifest_path.read_text())


def fetch_licensed_assets(
    simulator_output: Path = Path("simulator/output"),
    buyer_dir: Path = Path("aggregator/output/buyer_workspace"),
) -> list[dict[str, Any]]:
    """Copy mock Walrus blobs into a buyer workspace after license approval."""
    manifest = load_manifest(simulator_output)
    licensed_dir = buyer_dir / "licensed_assets"
    if licensed_dir.exists():
        shutil.rmtree(licensed_dir)
    licensed_dir.mkdir(parents=True, exist_ok=True)

    fetched: list[dict[str, Any]] = []
    for entry in manifest:
        source = simulator_output / entry["path"]
        if not source.exists():
            raise FileNotFoundError(f"Manifest points to missing blob: {source}")
        target = licensed_dir / entry["data_type"] / source.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        fetched.append({**entry, "local_path": str(target)})

    (buyer_dir / "licensed_manifest.json").write_text(json.dumps(fetched, indent=2) + "\n")
    return fetched


if __name__ == "__main__":
    assets = fetch_licensed_assets()
    print(f"Fetched {len(assets)} licensed encrypted DataAssets")
