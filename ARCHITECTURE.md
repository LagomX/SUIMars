# Mars Architecture

Mars is a decentralized delivery data infrastructure protocol on Sui + Walrus + Seal. It turns real-world delivery activity into user-owned encrypted DataAssets, licenses access to AI buyers through on-chain DataLicenses, and demonstrates AI utility through demand prediction and dispatch optimization.

## Repository Structure

```
contracts/
  mars/                  Sui Move package (5 modules)
  register_data_assets.ts
  prepare_data_license.ts
  package.json / tsconfig.json

simulator/               Personal DataAsset + wallet generator
  src/
  wallets/
  users/                 (gitignored — contains private keys)
  output/

walrus-uploader/         AES-256-GCM encryption + Walrus upload + Seal key registration
  src/

seal-access/             Seal access policy + AES-GCM decrypt
  src/
  input/
  output/

aggregator/              Python buyer-side licensed data pipeline
ai-agent/                LightGBM demand prediction + dispatch optimization
mars-app/                Expo/React Native ownership dashboard
scripts/                 Local pipeline orchestration
```

---

## End-to-End Protocol Flow

```
1. simulator:wallets
   → 100 riders + 40 merchants + 500 consumers
   → real Sui Ed25519 testnet keypairs
   → simulator/users/all_users.json  (gitignored)

2. simulator:generate
   → 640 PersonalDataAsset objects (one per user per data type)
   → 16 043 simulated delivery orders
   → simulator/output/raw_assets/**/*.json
   → simulator/output/orders.json

3. walrus-uploader
   → AES-256-GCM encrypt each DataAsset JSON
   → upload ciphertext to Walrus testnet → blob_id
   → SealClient.encrypt(aesKeyBytes, { packageId, id: dataAssetId }) → EncryptedObject
   → Sui PTB: register_data_asset(blob_id, contributors, data_type) → DataAsset object ID
   → walrus-uploader/output/upload_manifest.json
   → contracts/output/data_asset_registry.json
   → seal-access/output/seal_key_registry.json

4. contracts (testnet deployment flow)
   → sui client publish contracts/mars → PACKAGE_ID
   → register_data_assets.ts → on-chain DataAsset shared objects
   → prepare_data_license.ts → purchase DataLicense on-chain

5. seal-access
   Mock mode: demo AES key + mock policy check → AES-GCM decrypt
   Real mode: PTB calls seal_approve → Seal key servers release AES key → decrypt

6. aggregator + ai-agent (local AI pipeline)
   → aggregate licensed DataAssets
   → demand prediction training + inference
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
    blob_id: vector<u8>,        // Walrus blob identifier
    data_type: vector<u8>,      // "rider_mobility" | "merchant_operations" | "consumer_demand"
    quality_score: u64,         // 0–100; written by AI Agent
    price_usdc: Option<u64>,    // set by AI Agent via set_quality_and_price
    for_sale: bool,             // contributor toggles to list the asset
    reward_pool: Balance<USDC>, // accumulates from purchases
    created_at: u64,
}
```

**Key functions:**

- `new_contributor(addr, role, weight_bps)` — build a `Contributor` value in a PTB.
- `register_data_asset(blob_id, contributors, data_type, clock, ctx)` — creates and shares a `DataAsset`; returns the stable Sui object ID used by Seal.
- `set_quality_and_price(cap, asset, score, price, ctx)` — AI Agent sets quality and listing price (requires `AdminCap`).
- `set_for_sale(asset, for_sale, ctx)` — contributor lists or delists the asset.
- `distribute_reward(asset, ctx)` — distributes reward pool to contributors proportional to `weight_bps`.

**Invariants:**

- `blob_id` and `data_type` must be non-empty — enforced on registration (`EEmptyBlobId` / `EEmptyDataType`).
- `sum(contributors.weight_bps) == 10 000` — enforced on registration (`EInvalidWeights`).
- Only contributors may call `set_for_sale` (`ENotContributor`).
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
- `transfer_for_testing(license, recipient)` *(#[test_only])* — transfers a `DataLicense` to another address for testing; `DataLicense` lacks `store` so `transfer::transfer` is private to this module.

**`seal_approve` detail:**

```move
public fun seal_approve(
    id: vector<u8>,          // Seal IBE identity bytes = bcs::to_bytes(object::id(asset))
    license: &DataLicense,   // buyer-owned object in PTB
    asset: &DataAsset,       // shared object in PTB
    ctx: &TxContext,
) {
    // Binds this key to exactly one DataAsset (prevents key confusion)
    assert!(bcs::to_bytes(&object::id(asset)) == id, EUnauthorized);
    // Caller must hold a valid perpetual DataLicense for this asset
    assert!(verify_license(asset, license, ctx.sender()), EUnauthorized);
}
```

Seal key servers call this function in a dry-run PTB. If it aborts, the key is not released.

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

**Key functions:**

- `create_order(merchant, clock, ctx)` — shares a new `Order`.
- `pay_order(order, payment, ctx)` — customer locks USDC.
- `accept_order` / `start_preparing` / `pickup_order` / `mark_delivered` — fulfillment chain.
- `confirm_completed` — customer confirms or auto-completes after the 24-hour window.
- `raise_dispute` — customer raises a dispute; uses strict `<` against `delivered_at + DISPUTE_WINDOW_MS` so the dispute window closes one millisecond before the auto-complete window opens (no race at the exact boundary).
- `resolve_dispute` — admin resolves a dispute (`ruling=0` → refund; `ruling=1` → complete).
- `link_data_asset(order, asset_id)` — package-internal; links a DataAsset to an order.

Also defines `AdminCap` used by AI Agent for `set_quality_and_price` and dispute resolution.

---

#### `settlement.move`

Distributes completed order escrow.

- Merchant: 85 % of escrow.
- Rider: remainder (~15 %), absorbs rounding dust.

Permissionless — anyone can call after `order.state == Completed`.

---

#### `usdc.move`

Mock TestUSDC coin for testnet. `mint_for_testing(cap, amount, ctx)` seeds test wallets. Deployer receives `TreasuryCap`; metadata is frozen.

---

### `contracts/register_data_assets.ts`

TypeScript PTB script. After `walrus-uploader` produces `upload_manifest.json`, this script:

1. Reads each upload record.
2. Builds a PTB calling `data_asset::new_contributor` + `data_asset::register_data_asset`.
3. Signs with the deployer key (from Sui CLI wallet or `SUI_PRIVATE_KEY` env var).
4. Writes `contracts/output/data_asset_registry.json` mapping `user_id → data_asset_id`.

**Usage:**

```bash
PACKAGE_ID=0x... pnpm --dir contracts register:data-assets
```

---

### `contracts/prepare_data_license.ts`

TypeScript PTB script. Purchases a DataLicense on testnet by calling `data_license::purchase_access` with mock USDC.

**Usage:**

```bash
PACKAGE_ID=0x... ADMIN_CAP_ID=0x... pnpm --dir contracts prepare:data-license
```

---

### `simulator/`

Deterministic 7-day delivery simulator.

**Wallet generation (`simulator/wallets/generate_testnet_wallets.ts`):**

- Generates real Sui Ed25519 keypairs using `@mysten/sui`.
- Outputs `simulator/users/all_users.json` — includes `sui_address` and `private_key`.
- Private keys are gitignored. Never use these for mainnet funds.
- Configurable via `MARS_RIDER_COUNT` / `MARS_MERCHANT_COUNT` / `MARS_CONSUMER_COUNT`.

**DataAsset generation (`simulator/src/generator.ts`):**

- Reads `all_users.json`; throws descriptive error if missing (run `pnpm simulator:wallets` first).
- Creates one `PersonalDataAsset` per user per data type.
- Each asset embeds real Sui addresses in `owner` and `contributors[].addr`.
- `assertContributorWeights` validates `sum(weight_bps) == 10 000`.
- 16-grid spatial system (Santa Monica): `SM_A1` through `SM_D4`.
- Seeded random → deterministic output for reproducible tests.

**Key outputs:**

```
simulator/output/raw_assets/rider_mobility/*.json      (100 assets)
simulator/output/raw_assets/merchant_operations/*.json (40 assets)
simulator/output/raw_assets/consumer_demand/*.json     (500 assets)
simulator/output/orders.json                           (16 043 orders)
simulator/output/simulation_summary.json
```

---

### `walrus-uploader/`

Encrypts personal DataAssets and wires them into Walrus, Seal, and Sui.

**Pipeline (`uploadDataset.ts`):**

```
for each raw asset JSON:
  1. Validate contributor addresses and weight_bps
  2. encryptBytes(plaintext) → { ciphertext, key, iv, authTag }
  3. writeFile(encrypted_dir/<user_id>.bin, ciphertext)
  4. uploadEncryptedBlob(ciphertext) → blob_id
     mock: sha256 deterministic ID
     real: walrus store --json
  5. suiSealRegistration.registerUploadedDataset(manifest, aesKey)
     → SealClient.encrypt(aesKey, { packageId, id: dataAssetId })
     → writes seal-access/output/seal_key_registry.json
     → registers DataAsset on Sui via register_data_asset PTB
     → writes contracts/output/data_asset_registry.json
  6. append record to upload_manifest.json
     (raw AES key NOT written to disk in real mode)
```

**Security:**

- In **mock mode**: raw AES keys are not written to disk; `local_demo_keys.json` is not generated.
- In **real mode**: AES key is passed to `SealClient.encrypt` and immediately discarded. Only the Seal `EncryptedObject` is persisted.
- `MOCK_WALRUS=true` uses SHA-256 blob IDs and skips the Walrus CLI.

**Type safety:** `suiSealRegistration.ts` uses no `any` types — all Sui gRPC client calls are typed through a `TxWithEffectsAndTypes` alias (`SuiClientTypes.Transaction<{ effects: true; objectTypes: true }>`). The package ships as ESM (`"type": "module"`) with `moduleResolution: node16` and `.js` extension imports throughout.

**Config env vars (`.env.example`):**

| Variable | Default | Purpose |
|---|---|---|
| `MOCK_WALRUS` | `false` | Use deterministic mock blob IDs |
| `WALRUS_CLI_PATH` | `walrus` | Path to Walrus CLI binary |
| `WALRUS_CONTEXT` | `testnet` | Walrus network context |
| `SEAL_KEY_SERVER_OBJECT_ID` | (testnet default) | Seal key server object ID |
| `SEAL_AGGREGATOR_URL` | (testnet default) | Seal aggregator endpoint |
| `MAX_UPLOADS` | unset | Limit uploads for smoke tests |

---

### `seal-access/`

Seal-gated decryption module.

**Architecture note:** Seal does not encrypt Walrus blobs. Walrus blobs are encrypted with a symmetric AES-256-GCM key. Seal protects that key:

```
Data owner → SealClient.encrypt(aesKeyBytes, { packageId, id: dataAssetId })
           → EncryptedObject stored in seal_key_registry.json

Buyer      → PTB calling seal_approve (proves DataLicense ownership)
           → SealClient.decrypt(encryptedObject, { sessionKey, txBytes })
           → recovers aesKeyBytes
           → AES-GCM decrypt Walrus blob locally
           → output/decrypted_dataset.json (demo only)
```

**Files:**

| File | Purpose |
|---|---|
| `src/types.ts` | `DataAssetMetadata`, `EncryptionMaterial`, `SealAccessPolicy`, `SealAccessReceipt` |
| `src/config.ts` | `MOCK_SEAL`, `MOCK_BUYER_HAS_LICENSE`, paths, Sui/Seal env vars |
| `src/accessPolicy.ts` | `buildDataLicensePolicy()`, `explainPolicy()` |
| `src/keyRegistry.ts` | Registry loaders: data_asset_registry, data_license_registry, seal_key_registry |
| `src/sealClient.ts` | `initializeSealClient`, `registerKeyWithSeal`, `requestDecryptKey` |
| `src/walrusHttp.ts` | Shared `fetchWalrusBlob(blobId)` — single implementation used by both `batchDecrypt.ts` and `decryptDataset.ts` |
| `src/decryptDataset.ts` | `decryptAes256Gcm()`, `decryptDatasetWithSealAccess()` |
| `src/batchDecrypt.ts` | Batch decrypt all licensed DataAssets via Seal; uses `fetchWalrusBlob` from `walrusHttp.ts` |
| `src/index.ts` | CLI: `--user-id`, `--buyer`, `--data-asset-id`, `--metadata`, `--encrypted` |

**Mock mode (`MOCK_SEAL=true`):**

- Reads demo AES key from `input/encryption_key.demo.json`.
- Simulates DataLicense ownership check (`MOCK_BUYER_HAS_LICENSE=true|false`).
- Access-denied path writes receipt with `access_granted: false` and exits with code 1.
- No network calls.

**Real mode (`MOCK_SEAL=false`):**

- Requires deployed `contracts/mars` package with `seal_approve` in `data_license.move`.
- Requires Seal-registered AES key bundle in `seal_key_registry.json`.
- Builds PTB calling `seal_approve`, submits to Seal key servers, decrypts locally.

**Receipt format (`output/seal_access_receipt.json`):**

```json
{
  "mode": "mock",
  "buyer": "0x...",
  "data_asset_id": "0x...",
  "blob_id": "...",
  "policy": "DATA_LICENSE_OWNERSHIP",
  "access_granted": true,
  "reason": "Mock buyer owns DataLicense",
  "timestamp": "2026-05-27T...",
  "decrypted_output_path": "output/decrypted_dataset.json"
}
```

---

### `aggregator/`

Python buyer-side licensed data pipeline.

**Pipeline (`main.py`):**

1. `fetch_assets.py` — loads licensed DataAssets from simulator output.
2. `decrypt_assets.py` — AES-256-GCM decrypt (uses local demo keys in MVP).
3. `merge_events.py` — merges rider + merchant + consumer events by `order_id`.
4. `build_grid_time_dataset.py` — builds demand prediction rows (grid × 15-min window).
5. `build_dispatch_dataset.py` — builds dispatch optimization candidate states.
6. `export_buyer_dataset.py` — exports final JSON + CSV.

**Key design decisions:**

- `grid_index` (0–15 integer) included as categorical feature — prevents LightGBM from treating 16 grids identically despite 30% demand variation.
- `rider_session_orders` tracks cumulative per-rider orders for `fairness_score`.
- `grid_demand_map` per rider enables `demand_balance_score` (was previously a constant).
- Temporal train/val split (85% train / 15% val) prevents future data leakage.

**Outputs:**

```
aggregator/output/demand_prediction_dataset.json
aggregator/output/demand_prediction_dataset.csv
aggregator/output/dispatch_dataset.json
```

---

### `ai-agent/`

#### `demand_prediction/`

Predicts `future_30min_order_count` per grid-time window.

**Features (16):**

```
grid_index, order_count_t0, order_count_t_minus_1, order_count_t_minus_2,
active_riders, available_riders, pending_orders,
avg_accept_delay_min, avg_prep_time_min, avg_delivery_duration_min,
merchant_count, merchant_density, traffic_level,
weather_code, hour_of_day, day_of_week
```

Categorical features: `grid_index`, `weather_code`, `hour_of_day`, `day_of_week`.

**Model:**

1. **LightGBM** (`objective="poisson"`, `n_estimators=500`, early stopping at 50 rounds).
2. **sklearn fallback** (`HistGradientBoostingRegressor(loss="poisson")`).
3. Fails with explicit dependency error if neither is available.

#### `dispatch_optimization/`

Rule-based scoring for best-rider assignment.

**Scoring formula:**

```
dispatch_score =
  0.40 × proximity_score       (ETA-based: 1 - eta_min / MAX_ETA_MIN)
+ 0.18 × rider_idle_score      (1 - idle_time_min / MAX_IDLE_MIN)
+ 0.17 × fairness_score        (1 - session_orders / max_session_orders)
+ 0.25 × demand_balance_score  (1 - rider_grid_demand / max_grid_demand)
```

All scores are clamped to [0, 1]. `demand_balance_score` is per-rider (uses the demand in the rider's current grid, not a global constant).

**`DispatchWeights` invariant:** The frozen dataclass validates in `__post_init__` that `proximity + rider_idle + fairness + demand_balance == 1.0` (tolerance 1e-9). Any misconfigured weight combination raises `ValueError` at construction time.

---

## Data Flow Diagram

```
simulator/users/all_users.json  (640 wallets)
         │
         ▼
simulator/output/raw_assets/    (640 DataAsset JSON files)
         │
         ▼
walrus-uploader
  ├── AES-256-GCM encrypt
  ├── → Walrus blob (blob_id)
  ├── → SealClient.encrypt (Seal EncryptedObject)
  │      └── seal-access/output/seal_key_registry.json
  └── → Sui register_data_asset (DataAsset object ID)
         └── contracts/output/data_asset_registry.json
         │
         ▼
seal-access (buyer decrypt)
  ├── Mock: demo key → AES-GCM decrypt → decrypted_dataset.json
  └── Real: seal_approve PTB → Seal key servers → AES key → AES-GCM decrypt
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

## Mock vs Production

| Layer | Current (mock) | Production |
|---|---|---|
| Walrus storage | `MOCK_WALRUS=true`: SHA-256 blob IDs | Real Walrus testnet/mainnet CLI |
| DataAsset registration | `register_data_assets.ts` PTB on testnet | Same script; mainnet package |
| DataLicense purchase | `prepare_data_license.ts` + mock USDC | Real USDC; buyer wallet |
| Seal key release | `MOCK_SEAL=true`: demo key file | Real Seal key servers via `seal_approve` |
| Aggregator decrypt | Demo AES key from `local_demo_keys.json` | Read Seal-released key per license |
| Buyer identity | Env var / CLI arg | Wallet signature (zkLogin or direct) |
| Frontend data | Local JSON reads | Indexed Sui/Walrus/Seal state via SDK |

---

## Security Model

**Current protections:**

- Plaintext raw data is never uploaded to Walrus; only AES-256-GCM ciphertext is stored.
- In real upload mode, the raw AES key is passed directly to `SealClient.encrypt` and never written to disk.
- `seal_approve` cryptographically enforces that only the holder of a valid on-chain `DataLicense` can trigger key release.
- `encryption_key.demo.json` is clearly labelled as demo-only and unsafe.
- Private keys in `simulator/users/` are gitignored.

**Mock limitations (intentional for MVP):**

- `encryption_key.demo.json` contains the raw AES key in plaintext — this is the demo shortcut that real Seal replaces.
- `MOCK_SEAL=true` skips the on-chain DataLicense check.
- `aggregator` uses local demo keys rather than requesting them through Seal.

Each limitation has a direct production replacement path documented in `seal-access/src/sealClient.ts`.

---

## Development Commands

```bash
# Root workspace shortcuts
pnpm simulator:wallets        # generate Sui wallets
pnpm simulator:generate       # generate DataAssets
pnpm walrus:upload            # encrypt + upload + register
pnpm seal:decrypt:mock        # mock decrypt demo
pnpm seal:typecheck           # TypeScript check for seal-access

# Contracts (21 unit tests)
cd contracts/mars
sui move build
sui move test   # → 21/21 pass
pnpm --dir contracts register:data-assets
pnpm --dir contracts prepare:data-license

# AI pipeline
scripts/run_mars_ai_pipeline.sh
```
