#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON="${MARS_PYTHON:-python3}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required testnet environment variable: $name" >&2
    exit 1
  fi
}

require_env ADMIN_CAP_ID
require_env USDC_TREASURY_CAP_ID

echo "1. Generate Sui testnet-compatible simulator wallets"
pnpm simulator:wallets

echo "2. Generate simulator delivery datasets"
pnpm simulator:generate

echo "3. Encrypt and upload datasets to Walrus testnet, then register DataAssets on Sui testnet"
pnpm walrus:upload

echo "4. Evaluate DataAsset prices and submit pricing to Sui testnet"
pnpm pricing:evaluate
pnpm pricing:apply

echo "5. List first DataAsset, mint TestUSDC, and purchase DataLicense"
pnpm contracts:license

echo "6. Seal-gated decrypt for licensed buyer"
pnpm seal:decrypt

echo "7. Aggregate licensed decrypted data"
"$PYTHON" aggregator/main.py

echo "8. Train and run AI models"
"$PYTHON" ai-agent/demand_prediction/train_demand_model.py
"$PYTHON" ai-agent/demand_prediction/predict_demand.py
"$PYTHON" ai-agent/dispatch_optimization/assign_rider.py

echo ""
echo "Generated outputs:"
for path in \
  simulator/output/orders.json \
  ai-pricing/output/pricing_report.json \
  ai-pricing/output/pricing_apply_receipt.json \
  walrus-uploader/output/upload_manifest.json \
  contracts/output/data_asset_registry.json \
  contracts/output/data_license_registry.json \
  seal-access/output/seal_key_registry.json \
  seal-access/output/seal_access_receipt.json \
  seal-access/output/decrypted_dataset.json \
  aggregator/output/demand_prediction_dataset.csv \
  aggregator/output/dispatch_dataset.json \
  ai-agent/demand_prediction/output/demo_grid_predictions.json \
  ai-agent/dispatch_optimization/output/sample_assignment.json
do
  if [[ -s "$path" ]]; then
    echo "  OK  $path"
  else
    echo "  MISSING_OR_EMPTY  $path"
    exit 1
  fi
done
