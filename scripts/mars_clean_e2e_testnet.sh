#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON="${MARS_PYTHON:-python3}"

GENERATED_DIRS=(
  "simulator/output"
  "ai-pricing/output"
  "walrus-uploader/output"
  "contracts/output"
  "seal-access/output"
  "aggregator/output"
  "ai-agent/demand_prediction/output"
  "ai-agent/dispatch_optimization/output"
)

GENERATED_FILES=(
  "simulator/users/all_users.json"
  "simulator/users/consumers.json"
  "simulator/users/merchants.json"
  "simulator/users/riders.json"
)

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required testnet environment variable: $name" >&2
    exit 1
  fi
}

echo "========== CLEAN START =========="
echo "Deleting generated directories:"
for dir in "${GENERATED_DIRS[@]}"; do
  echo "  $dir"
  rm -rf "$dir"
done

echo "Deleting generated files:"
for file in "${GENERATED_FILES[@]}"; do
  echo "  $file"
  rm -f "$file"
done

for dir in "${GENERATED_DIRS[@]}"; do
  mkdir -p "$dir"
done

if [[ -f contracts/.env ]]; then
  set -a
  # shellcheck source=/dev/null
  source contracts/.env
  set +a
fi

require_env ADMIN_CAP_ID
require_env USDC_TREASURY_CAP_ID

echo ""
echo "========== RUN SHARD TESTNET PIPELINE =========="

echo "1. Generate fresh Sui testnet-compatible simulator users"
pnpm simulator:wallets

echo "2. Generate fresh simulator delivery datasets"
pnpm simulator:generate

echo "3. Build authorized DatasetShards, encrypt, upload to Walrus, register DataShards, and register Seal keys"
pnpm walrus:upload

echo "4. Evaluate and apply shard pricing"
pnpm pricing:evaluate
pnpm pricing:apply

echo "5. Purchase collection-level DataLicenses for all DataShards"
pnpm contracts:license

echo "6. Collection-level Seal decrypt"
pnpm seal:decrypt

echo "7. Load decrypted shards and build AI feature datasets"
"$PYTHON" aggregator/main.py

echo "8. Train demand model"
"$PYTHON" ai-agent/demand_prediction/train_demand_model.py

echo "9. Run demand prediction"
"$PYTHON" ai-agent/demand_prediction/predict_demand.py

echo "10. Run dispatch assignment"
"$PYTHON" ai-agent/dispatch_optimization/assign_rider.py

echo ""
echo "========== FINAL SUMMARY =========="
node <<'NODE'
const fs = require("fs");
const path = require("path");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const exists = (file) => fs.existsSync(file);
const fail = (message) => {
  console.error(`CHECK_FAILED: ${message}`);
  process.exitCode = 1;
};

const users = readJson("simulator/users/all_users.json");
const shardDir = "walrus-uploader/output/shards";
const shardFiles = exists(shardDir)
  ? fs.readdirSync(shardDir).filter((name) => name.endsWith(".json"))
  : [];
const manifest = readJson("walrus-uploader/output/upload_manifest.json");
const registry = readJson("contracts/output/data_asset_registry.json");
const sealKeys = readJson("seal-access/output/seal_key_registry.json");
const licenses = readJson("contracts/output/data_license_registry.json");
const decryptManifest = readJson("aggregator/output/buyer_workspace/decryption_manifest.json");
const accounting = readJson("walrus-uploader/output/contributor_accounting.json");
const authorizations = readJson("walrus-uploader/output/listing_authorizations.json");
const mergedOrders = readJson("aggregator/output/merged_orders.json");
const trainingSummary = readJson("ai-agent/demand_prediction/output/training_summary.json");
const assignment = readJson("ai-agent/dispatch_optimization/output/sample_assignment.json");

const decryptedCounts = {};
for (const entry of decryptManifest) {
  decryptedCounts[entry.data_type] = (decryptedCounts[entry.data_type] ?? 0) + entry.asset_count;
}

const checks = {
  users_generated: users.length,
  shard_files: shardFiles.length,
  walrus_blobs: manifest.filter((entry) => entry.blob_id).length,
  sui_data_shards: registry.filter((entry) => entry.data_asset_id?.startsWith("0x")).length,
  seal_keys: sealKeys.length,
  licenses: licenses.length,
  decrypted_shards: decryptManifest.length,
  contributor_accounting_records: accounting.length,
  consumer_behavior_rows: decryptedCounts.consumer_behavior ?? 0,
  merchant_operations_rows: decryptedCounts.merchant_operations ?? 0,
  rider_mobility_rows: decryptedCounts.rider_mobility ?? 0,
  merged_orders: mergedOrders.length,
  demand_training_rows: trainingSummary.training_rows,
  demand_validation_rows: trainingSummary.validation_rows,
  dispatch_assignment_success: Boolean(assignment.best_assignment?.rider_id),
};

const expected = {
  users_generated: 640,
  shard_files: 3,
  walrus_blobs: 3,
  sui_data_shards: 3,
  seal_keys: 3,
  licenses: 3,
  decrypted_shards: 3,
  contributor_accounting_records: 640,
  consumer_behavior_rows: 500,
  merchant_operations_rows: 40,
  rider_mobility_rows: 100,
  dispatch_assignment_success: true,
};

for (const [key, expectedValue] of Object.entries(expected)) {
  if (checks[key] !== expectedValue) {
    fail(`${key} expected ${expectedValue}, got ${checks[key]}`);
  }
}

if (checks.merged_orders <= 0) fail(`merged_orders must be > 0, got ${checks.merged_orders}`);
if (checks.demand_training_rows <= 0) fail(`demand_training_rows must be > 0, got ${checks.demand_training_rows}`);
if (checks.demand_validation_rows <= 0) fail(`demand_validation_rows must be > 0, got ${checks.demand_validation_rows}`);
if (authorizations.length !== 640) fail(`listing_authorizations expected 640, got ${authorizations.length}`);

for (const entry of manifest) {
  if (entry.compression !== "gzip") fail(`${entry.shard_id} compression expected gzip`);
  if (entry.encryption?.algorithm !== "AES-256-GCM") fail(`${entry.shard_id} encryption expected AES-256-GCM`);
}

const commitmentFields = [
  "shard_content_hash",
  "contributor_root",
  "authorization_root",
  "accounting_root",
];
for (const entry of registry) {
  for (const field of commitmentFields) {
    if (!entry[field]) fail(`${entry.shard_id ?? entry.data_asset_id} missing ${field}`);
  }
}

for (const [key, value] of Object.entries(checks)) {
  console.log(`${key}: ${value}`);
}

console.log("scoped_listing_authorizations: " + authorizations.length);
console.log("gzip_aes_encrypted_shards: " + manifest.length);
console.log("commitment_fields_per_data_shard: 4");
console.log("old_artifacts_reused: false");
NODE

echo "========== CLEAN E2E COMPLETE =========="
