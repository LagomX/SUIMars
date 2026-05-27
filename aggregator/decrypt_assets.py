from __future__ import annotations

import base64
import json
import shutil
from pathlib import Path
from typing import Any


def load_mock_keys(simulator_output: Path = Path("simulator/output")) -> dict[str, str]:
    key_path = simulator_output / "mock_walrus" / "mock_keys.json"
    if not key_path.exists():
        raise FileNotFoundError(f"Missing mock key file: {key_path}")
    return json.loads(key_path.read_text())


def decrypt_asset(envelope: dict[str, Any], keys: dict[str, str]) -> dict[str, Any]:
    key_id = envelope["key_id"]
    if key_id not in keys:
        raise PermissionError(f"No mock key available for {envelope['asset_id']}")
    if envelope.get("encryption") != "mock-base64":
        raise ValueError(f"Unsupported encryption mode: {envelope.get('encryption')}")
    plaintext = base64.b64decode(envelope["ciphertext_base64"]).decode("utf-8")
    return json.loads(plaintext)


def decrypt_licensed_assets(
    buyer_dir: Path = Path("aggregator/output/buyer_workspace"),
    simulator_output: Path = Path("simulator/output"),
) -> list[dict[str, Any]]:
    licensed_dir = buyer_dir / "licensed_assets"
    decrypted_dir = buyer_dir / "decrypted_assets"
    if decrypted_dir.exists():
        shutil.rmtree(decrypted_dir)
    decrypted_dir.mkdir(parents=True, exist_ok=True)

    keys = load_mock_keys(simulator_output)
    assets: list[dict[str, Any]] = []
    for encrypted_path in sorted(licensed_dir.glob("*/*.json")):
        envelope = json.loads(encrypted_path.read_text())
        asset = decrypt_asset(envelope, keys)
        target = decrypted_dir / asset["data_type"] / f"{asset['asset_id']}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(asset, indent=2) + "\n")
        assets.append(asset)

    return assets


if __name__ == "__main__":
    decrypted = decrypt_licensed_assets()
    print(f"Decrypted {len(decrypted)} licensed DataAssets")
