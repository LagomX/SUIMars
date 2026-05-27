"""
Fetch and decrypt all licensed DataAssets from Walrus via Seal.

This module drives the TypeScript batch-decrypt script, which:
  1. Requests the AES-256-GCM key for each licensed DataAsset from Seal key servers.
  2. Fetches the encrypted blob from Walrus testnet.
  3. Decrypts locally (AES-256-GCM).
  4. Expands PersonalDataset.assets[] into individual JSON files under
       aggregator/output/buyer_workspace/decrypted_assets/<data_type>/<asset_id>.json

Prerequisites (run once before this script):
  pnpm simulator:wallets
  pnpm simulator:generate
  pnpm walrus:upload
  pnpm --dir contracts register:data-assets
  pnpm --dir contracts prepare:data-license

Requires:
  - contracts/output/data_asset_registry.json
  - contracts/output/data_license_registry.json
  - seal-access/output/seal_key_registry.json
  - walrus-uploader/output/upload_manifest.json
  - BUYER_PRIVATE_KEY env var or active Sui CLI wallet with the licensed DataLicense
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def fetch_licensed_assets(
    buyer_dir: Path = Path("aggregator/output/buyer_workspace"),
) -> list[dict[str, Any]]:
    """
    Run pnpm aggregator:decrypt to decrypt all licensed DataAssets via Seal.

    Writes individual asset files under buyer_dir/decrypted_assets/ and a
    summary manifest at buyer_dir/decryption_manifest.json.

    Returns the list of manifest entries (one per successfully decrypted DataAsset).

    Raises RuntimeError if the TypeScript script exits with a non-zero status.
    """
    print("Decrypting licensed DataAssets via Seal + Walrus...")

    result = subprocess.run(
        ["pnpm", "aggregator:decrypt"],
        capture_output=False,   # stream stdout/stderr directly so progress is visible
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"pnpm aggregator:decrypt exited with code {result.returncode}. "
            "Check the output above for details."
        )

    manifest_path = buyer_dir / "decryption_manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(
            f"Decryption manifest not found: {manifest_path}\n"
            "The TypeScript batch-decrypt script should have created it."
        )

    manifest: list[dict[str, Any]] = json.loads(manifest_path.read_text())
    return manifest


if __name__ == "__main__":
    entries = fetch_licensed_assets()
    total_assets = sum(e.get("asset_count", 0) for e in entries)
    print(f"Decrypted {len(entries)} DataAsset blob(s) → {total_assets} individual asset file(s)")
