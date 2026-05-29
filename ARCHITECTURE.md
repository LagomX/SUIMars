# Mars Architecture

Mars is a decentralized delivery data infrastructure protocol on Sui + Walrus + Seal. It turns real-world delivery activity into contributor-owned encrypted DataAssets, licenses access to AI buyers through on-chain DataLicenses, and demonstrates AI utility through demand prediction and dispatch optimization.

## Repository Structure

```
contracts/
  mars/                  Sui Move package (5 modules)
  prepare_data_license.ts
  suiUtils.ts
  package.json / tsconfig.json

simulator/               Personal DataAsset + wallet generator
  src/
  wallets/
  users/                 (gitignored — contains private keys)
  output/

walrus-uploader/         Shard aggregation + AES-256-GCM encryption + Walrus HTTP upload + Seal key registration
  src/

seal-access/             Seal access policy + AES-GCM decrypt
  src/
  output/

aggregator/              Python buyer-side licensed data pipeline
ai-agent/                LightGBM demand prediction + dispatch optimization
mars-marketplace-design/ Next.js marketplace frontend
mars-app/                Expo/React Native ownership dashboard
scripts/                 Pipeline orchestration scripts
```

---

## End-to-End Protocol Flow

```
1. simulator:wallets
   → 100 riders + 40 merchants + 500 consumers
   → real Sui Ed25519 testnet keypairs
   → simulator/users/all_users.json  (gitignored)

2. simulator:generate
   → 640 PersonalDataAsset JSON files (one per user)
   → 16 043 simulated delivery orders
   → simulator/output/raw_assets/**/*.json
   → simulator/output/orders.json

3. walrus:upload  (walrus-uploader/src/uploadDataset.ts)
   → simulate scoped listing authorization per user
   → aggregate assets into DatasetShards by (data_type × region × epoch)
   → for each shard:
       JSON → gzip → AES-256-GCM encrypt → upload to Walrus HTTP Publisher → blob_id
       compute SHA-256 commitment roots (content, contributor, authorization, accounting)
   → batch PTB: register_data_shard(...) → DataAsset shared object ID  [up to 90 per PTB]
   → parallel SealClient.encrypt(aesKey, { packageId, id: dataAssetId }) [concurrency 20]
   → walrus-uploader/output/upload_manifest.json
   → walrus-uploader/output/listing_authorizations.json
   → walrus-uploader/output/contributor_accounting.json
   → contracts/output/data_asset_registry.json
   → seal-access/output/seal_key_registry.json

4. pricing:testnet
   → ai-pricing/price_report.py → quality scores + micro-USDC prices
   → walrus-uploader/src/priceAssets.ts → batch PTB set_quality_and_price(AdminCap, DataAsset, score, price)
   → ai-pricing/output/pricing_report.json
   → ai-pricing/output/pricing_apply_receipt.json

5. contracts:license
   → contracts/prepare_data_license.ts
   → mint TestUSDC (USDC_TREASURY_CAP_ID)
   → call set_for_sale(true) + purchase_access(DataAsset, payment, clock)
   → DataLicense minted and transferred to buyer
   → contracts/output/data_license_registry.json

6. seal:decrypt / aggregator:decrypt
   → build PTB calling seal_approve(id, license, asset)
   → Seal key servers verify DataLicense ownership → release AES key
   → AES-GCM decrypt Walrus blob locally → plaintext shard JSON

7. aggregator + ai-agent (local AI pipeline)
   → aggregate licensed DatasetShards
   → demand prediction training + inference (LightGBM)
   → dispatch optimization scoring
```

---

## Module Reference

### `contracts/mars/`

Sui Move package. Implements the full on-chain data economy.

#### `data_asset.move`

Registers encrypted Walrus blobs as on-chain shared objects.

**Key struct:**

```move
public struct DataAsset has key {
    id: UID,
    contributors: vector<Contributor>,
    blob_id: vector<u8>,              // Walrus blob identifier
    data_type: vector<u8>,            // "rider_mobility" | "merchant_operations" | "consumer_behavior"
    region: vector<u8>,               // aggregation region (e.g. "santa_monica")
    epoch: vector<u8>,                // aggregation epoch (ISO week, e.g. "2026-W01")
    shard_content_hash: vector<u8>,   // SHA-256 of canonical plaintext shard content
    contributor_root: vector<u8>,     // SHA-256 commitment to contributor manifests
    authorization_root: vector<u8>,   // SHA-256 commitment to listing authorizations
    accounting_root: vector<u8>,      // SHA-256 commitment to contributor accounting records
    total_contributors: u64,
    total_events: u64,
    quality_score: u64,               // 0–100; set by AI Agent
    price_usdc: Option<u64>,          // set by AI Agent via set_quality_and_price
    for_sale: bool,                   // contributor toggles to list
    reward_pool: Balance<USDC>,
    created_at: u64,
}
```

**Key functions:**

- `register_data_shard(blob_id, data_type, region, epoch, shard_content_hash, contributor_root, authorization_root, accounting_root, total_contributors, total_events, clock, ctx)` — creates and shares a shard-level DataAsset. The on-chain contributor is the listing operator (`ctx.sender()`); individual contributor shares live off-chain committed by `accounting_root`.
- `register_data_asset(blob_id, contributors, data_type, clock, ctx)` — legacy personal-asset registration; kept for backward compatibility.
- `set_quality_and_price(cap, asset, score, price, ctx)` — AI Agent sets quality and listing price (requires `AdminCap`).
- `set_for_sale(asset, for_sale, ctx)` — contributor lists or delists the asset.
- `distribute_reward(asset, ctx)` — distributes reward pool to contributors proportional to `weight_bps`.

**Invariants:**

- `blob_id` and `data_type` must be non-empty — `EEmptyBlobId` / `EEmptyDataType`.
- All shard commitment fields must be non-empty — `EEmptyCommitment`.
- `sum(contributors.weight_bps) == 10 000` — `EInvalidWeights`.
- Only contributors may call `set_for_sale` — `ENotContributor`.
- Only `purchase_access` funds `reward_pool` (package-visibility gate).

---

#### `data_license.move`

Mints `DataLicense` objects on purchase and enforces Seal access policy.

**Key struct:**

```move
public struct DataLicense has key {
    id: UID,
    data_asset_id: ID,        // which DataAsset was licensed
    buyer: address,
    usdc_paid: u64,
    purchased_at: u64,
    license_type: vector<u8>, // b"perpetual"
}
```

**Key functions:**

- `purchase_access(asset, payment, clock, ctx)` — validates listing + exact payment, funds reward pool, mints DataLicense and transfers it to `ctx.sender()`.
- `verify_license(asset, license, requester) → bool` — checks `data_asset_id` match, `buyer == requester`, perpetual license type.
- **`seal_approve(id, license, asset, ctx)`** — Seal key server gate.

**`seal_approve` detail:**

```move
public fun seal_approve(
    id: vector<u8>,          // Seal IBE identity bytes = bcs::to_bytes(object::id(asset))
    license: &DataLicense,   // buyer-owned object in PTB
    asset: &DataAsset,       // shared object in PTB
    ctx: &TxContext,
) {
    assert!(bcs::to_bytes(&object::id(asset)) == id, EUnauthorized);
    assert!(verify_license(asset, license, ctx.sender()), EUnauthorized);
}
```

Seal key servers call this in a dry-run PTB. If it aborts, the key is not released.

**How to build the PTB in TypeScript:**

```typescript
const tx = new Transaction();
const assetIdBytes = Array.from(fromHex(dataAssetObjectId)); // 32 bytes
tx.moveCall({
  target: `${PACKAGE_ID}::data_license::seal_approve`,
  arguments: [
    tx.pure.vector("u8", assetIdBytes),
    tx.object(licenseObjectId),    // buyer-owned DataLicense
    tx.object(dataAssetObjectId),  // shared DataAsset
  ],
});
const txBytes = await tx.build({ client: suiClient });
// Pass to SealClient.decrypt({ data: sealEncryptedKeyBundle, sessionKey, txBytes })
```

---

#### `escrow.move`

Delivery order lifecycle and USDC escrow.

**State machine:**

```
Created → Paid → Accepted → (Preparing →) PickedUp → Delivered → Completed
                                                                ↘ Disputed → Cancelled | Completed
Created | Paid → Cancelled
```

Also defines `AdminCap` used by AI Agent for `set_quality_and_price` and dispute resolution.

---

#### `settlement.move`

Distributes completed order escrow. Merchant: 85%; Rider: remainder. Permissionless.

---

#### `usdc.move`

Mock TestUSDC coin for testnet. `mint_for_testing(cap, amount, ctx)` seeds test wallets.

---

### `walrus-uploader/`

Aggregates personal DataAssets into dataset shards, encrypts, uploads to Walrus, and wires into Sui + Seal.

#### Pipeline (`uploadDataset.ts`)

```
1. Load 640 PersonalDataAsset JSON files from simulator/output/raw_assets/
2. Simulate a scoped listing authorization for each user
   (signed: user_id, user_address, data_type, region, epoch, expires_at)
3. Validate and filter to authorized assets only
4. Group authorized assets into DatasetShards by (data_type × region × epoch)
   → contributor accounting (share_ppm per contributor per shard)
   → SHA-256 commitment roots: shard_content_hash, contributor_root,
     authorization_root, accounting_root
5. For each shard (concurrency 5):
   a. JSON → gzip → AES-256-GCM encrypt (random 256-bit key per shard)
   b. Write encrypted blob to walrus-uploader/output/encrypted/<shard_id>.json.gz.enc
   c. Upload ciphertext to Walrus HTTP Publisher → blob_id
6. Sequential PTB batches (90 shards per PTB):
   register_data_shard(...) → DataAsset shared object ID
7. Parallel Seal registration (concurrency 20):
   SealClient.encrypt(aesKey, { packageId, id: dataAssetId }) → EncryptedObject
   AES key zeroed in memory after Seal wraps it
8. Write output files
```

#### `suiSealRegistration.ts`

- `BATCH_SIZE = 90` — max `register_data_shard` calls per PTB (nonce safety)
- `SEAL_CONCURRENCY = 20` — parallel Seal key registrations
- Uses Sui gRPC client (`SuiGrpcClient`) for transaction execution
- Reads signer from `SUI_PRIVATE_KEY` env var or active Sui CLI wallet
- Reads package ID from `SEAL_PACKAGE_ID` / `SUI_PACKAGE_ID` env var or `contracts/mars/Published.toml`

#### `walrusClient.ts`

Uses the Walrus HTTP Publisher API — no Walrus CLI dependency.

```
PUT https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=N
Content-Type: application/octet-stream
Body: encrypted shard bytes
→ Response JSON contains blob_id
```

Retry logic: up to 6 attempts; exponential backoff on network errors, 429, and 5xx.

#### Config env vars (`walrus-uploader/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `SUI_RPC_URL` | testnet fullnode | Sui gRPC endpoint |
| `SUI_PRIVATE_KEY` | Sui CLI wallet | Signer for DataAsset registration and pricing |
| `SUI_PACKAGE_ID` / `SEAL_PACKAGE_ID` | Published.toml | Mars Move package ID |
| `WALRUS_PUBLISHER_URL` | testnet publisher | Walrus HTTP Publisher base URL |
| `WALRUS_EPOCHS` | `2` | Walrus blob storage duration in epochs |
| `SEAL_KEY_SERVER_OBJECT_ID` | testnet default | Seal key server object ID |
| `SEAL_AGGREGATOR_URL` | testnet default | Seal aggregator endpoint |
| `SEAL_THRESHOLD` | `1` | Seal threshold for key recovery |
| `SEAL_VERIFY_KEY_SERVERS` | `false` | Verify Seal key server TLS certificates |
| `USERS_PATH` | `simulator/users/all_users.json` | Simulator wallet file |
| `RAW_ASSETS_DIR` | `simulator/output/raw_assets` | Raw asset JSON directory |
| `MAX_UPLOADS` | unset | Limit shard count for smoke tests |

---

### `seal-access/`

Seal-gated decryption module.

**Architecture note:** Seal does not encrypt Walrus blobs. Walrus blobs are encrypted with AES-256-GCM. Seal protects the symmetric AES key:

```
Uploader → SealClient.encrypt(aesKeyBytes, { packageId, id: dataAssetId })
         → EncryptedObject stored in seal_key_registry.json

Buyer    → PTB calling seal_approve (proves DataLicense ownership)
         → SealClient.decrypt(encryptedObject, { sessionKey, txBytes })
         → recovers aesKeyBytes
         → gunzip + AES-GCM decrypt Walrus blob locally
```

**Files:**

| File | Purpose |
|---|---|
| `src/types.ts` | `DataAssetMetadata`, `EncryptionMaterial`, `SealAccessPolicy`, `SealAccessReceipt` |
| `src/config.ts` | `MOCK_SEAL`, `MOCK_BUYER_HAS_LICENSE`, paths, Sui/Seal env vars |
| `src/accessPolicy.ts` | `buildDataLicensePolicy()`, `explainPolicy()` |
| `src/keyRegistry.ts` | Registry loaders: data_asset_registry, seal_key_registry |
| `src/sealClient.ts` | `initializeSealClient`, `registerKeyWithSeal`, `requestDecryptKey` |
| `src/walrusHttp.ts` | `fetchWalrusBlob(blobId)` — shared HTTP fetch for both decrypt paths |
| `src/decryptDataset.ts` | `decryptAes256Gcm()`, `decryptDatasetWithSealAccess()` |
| `src/batchDecrypt.ts` | Batch decrypt all licensed DataAssets via Seal |
| `src/index.ts` | CLI: `--user-id`, `--buyer`, `--data-asset-id`, `--metadata`, `--encrypted` |

---

### `aggregator/`

Python buyer-side licensed data pipeline.

**Pipeline (`main.py`):**

1. `fetch_assets.py` — loads licensed DataAssets from simulator output.
2. `decrypt_assets.py` — AES-256-GCM decrypt (uses Seal-released key or local demo key).
3. `merge_events.py` — merges rider + merchant + consumer events by `order_id`.
4. `build_grid_time_dataset.py` — builds demand prediction rows (grid × 15-min window).
5. `build_dispatch_dataset.py` — builds dispatch optimization candidate states.

**Key design decisions:**

- `grid_index` (0–15 integer) included as categorical feature — prevents LightGBM from treating 16 grids identically.
- `rider_session_orders` tracks cumulative per-rider orders for `fairness_score`.
- Temporal train/val split (85% / 15%) prevents future data leakage.

---

### `ai-agent/`

#### `demand_prediction/`

Predicts `future_30min_order_count` per grid-time window.

**Features (16):** `grid_index`, order counts (t, t-1, t-2), rider availability, pending orders, timing metrics, merchant density, `traffic_level`, `weather_code`, `hour_of_day`, `day_of_week`.

**Model:** LightGBM (`objective="poisson"`, 500 estimators, early stopping at 50 rounds).

#### `dispatch_optimization/`

Rule-based scoring for best-rider assignment.

```
dispatch_score =
  0.40 × proximity_score       (ETA-based)
+ 0.18 × rider_idle_score
+ 0.17 × fairness_score        (session order count)
+ 0.25 × demand_balance_score  (rider's current grid demand)
```

`DispatchWeights` validates that weights sum to exactly 1.0 at construction time.

---

### `mars-marketplace-design/`

Next.js marketplace frontend. Reads pipeline output files at build/request time.

**Data layer (`lib/marketplace-data.ts`):**

- Reads `upload_manifest.json` + `data_asset_registry.json` + `pricing_report.json` + `seal_key_registry.json`.
- One `Dataset` entry per shard upload record.
- Falls back to `lib/sample-datasets.ts` if pipeline outputs are absent.

**Purchase flow (`components/marketplace/purchase-modal.tsx`):**

- Builds one PTB with N `purchase_access` calls (one per DataAsset in the dataset).
- One wallet signature → N `DataLicense` objects minted.

---

## Data Flow Diagram

```
simulator/users/all_users.json  (640 wallets)
         │
         ▼
simulator/output/raw_assets/    (640 PersonalDataAsset JSON files)
         │
         ▼ (aggregate by data_type × region × epoch)
walrus-uploader
  ├── listing_authorizations.json   (simulated opt-in per user)
  ├── contributor_accounting.json   (share_ppm per contributor per shard)
  ├── shards/                       (aggregated shard JSON)
  ├── encrypted/                    (gzip + AES-256-GCM ciphertext)
  ├── → Walrus HTTP Publisher (blob_id per shard)
  ├── → Sui register_data_shard PTB (DataAsset object ID per shard)
  │      └── contracts/output/data_asset_registry.json
  ├── → SealClient.encrypt (EncryptedObject per shard)
  │      └── seal-access/output/seal_key_registry.json
  └── upload_manifest.json
         │
         ▼ (pricing)
ai-pricing → set_quality_and_price → pricing_apply_receipt.json
         │
         ▼ (purchase)
contracts/prepare_data_license → DataLicense objects → data_license_registry.json
         │
         ▼ (decrypt)
seal-access → PTB seal_approve → Seal key servers → AES key → gunzip + decrypt
         │
         ▼
aggregator/output/
  ├── demand_prediction_dataset.csv
  └── dispatch_dataset.json
         │
         ▼
ai-agent/
  ├── demand model training + inference
  └── dispatch scoring + assignment
```

---

## Security Model

- Plaintext shard data is never uploaded to Walrus — only gzip-compressed AES-256-GCM ciphertext.
- The AES key is passed directly to `SealClient.encrypt` and zeroed in memory immediately after — never written to disk.
- `seal_approve` cryptographically enforces that only the holder of a valid on-chain `DataLicense` can trigger key release.
- SHA-256 commitment roots on-chain allow buyers to verify that the shard content, contributor set, and accounting records were not tampered with between registration and decryption.
- Private keys in `simulator/users/` are gitignored. Never use simulator wallets for mainnet funds.

---

## Development Commands

```bash
# Root workspace shortcuts
pnpm simulator:wallets        # generate Sui wallets
pnpm simulator:generate       # generate DataAssets
pnpm walrus:upload            # encrypt + upload + register
pnpm pricing:testnet          # AI pricing + on-chain submission
pnpm contracts:license        # purchase DataLicenses
pnpm seal:decrypt             # single-shard Seal decrypt
pnpm aggregator:decrypt       # batch Seal decrypt
pnpm aggregator:run           # build AI datasets
pnpm ai:train                 # train and run models
pnpm mars:e2e:testnet         # full pipeline

# Type checking
pnpm walrus:typecheck
pnpm seal:typecheck
pnpm contracts:typecheck

# Contracts (Move)
cd contracts/mars
sui move build
sui move test   # → 21/21 pass
```
