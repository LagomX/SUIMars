# Mars Aggregator

The aggregator is the buyer-side licensed data pipeline.  It does not receive raw plaintext
from Mars.  Instead it proves on-chain DataLicense ownership to Seal key servers, retrieves
the AES-256-GCM decryption key for each licensed DataAsset, fetches the encrypted blob from
Walrus, and decrypts locally.  Decryption is performed by the TypeScript `seal-access` module;
the Python pipeline only processes the resulting plaintext.

## Prerequisites

Complete the testnet deployment first (see `TESTNET.md`):

```bash
# 1. Generate wallets + data
pnpm simulator:wallets
pnpm simulator:generate

# 2. Encrypt, upload to Walrus, register keys with Seal and DataAssets on Sui
pnpm walrus:upload

# 3. Register DataAsset objects on-chain
pnpm --dir contracts register:data-assets

# 4. Purchase DataLicense objects on-chain
pnpm --dir contracts prepare:data-license
```

## Run

```bash
pip3 install -r aggregator/requirements.txt
python3 aggregator/main.py
```

The buyer wallet is taken from `BUYER_PRIVATE_KEY` env var (see `seal-access/.env.example`),
or falls back to the active Sui CLI wallet.

## Outputs

| Path | Contents |
|---|---|
| `aggregator/output/demand_prediction_dataset.csv` | 16-grid × 15-min demand forecasting rows |
| `aggregator/output/demand_prediction_dataset.json` | Same, JSON format |
| `aggregator/output/dispatch_dataset.json` | Per-order dispatch candidate states |
| `aggregator/output/buyer_dataset/manifest.json` | Buyer delivery snapshot manifest |
| `aggregator/output/buyer_workspace/decryption_manifest.json` | Per-asset decrypt result |
| `aggregator/output/buyer_workspace/decrypted_assets/` | Plaintext asset JSON files |

## Pipeline

1. **`fetch_assets.py`** — Calls `pnpm aggregator:decrypt` which runs
   `seal-access/src/batchDecrypt.ts`:
   - Proves DataLicense ownership to Seal key servers via `data_license::seal_approve`.
   - Fetches encrypted blobs from Walrus testnet.
   - Decrypts with AES-256-GCM.
   - Expands `PersonalDataset.assets[]` into individual files under
     `buyer_workspace/decrypted_assets/<data_type>/<asset_id>.json`.

2. **`decrypt_assets.py`** — Loads the already-decrypted JSON files (no crypto here).

3. **`merge_events.py`** — Joins rider + merchant + consumer events by `order_id`.

4. **`build_grid_time_dataset.py`** — 16-grid × 15-min demand prediction rows.

5. **`build_dispatch_dataset.py`** — Real-time order + candidate rider states.

6. **`export_buyer_dataset.py`** — Packages final JSON and CSV datasets.

Note: dispatch candidate riders use synthetic location states derived from the licensed
order data.  A production system would query live rider state from the platform.
