# Mars Architecture

Mars is a decentralized delivery + user-owned data licensing protocol on Sui. The current codebase implements a complete Mars V4 mock protocol loop: delivery data is simulated, encrypted, registered as role-owned DataAssets, licensed to AI buyers, monetized through rewards, and unlocked through a Seal-style access-control check.

This document is a technical reference for maintainers, reviewers, and future contributors. It describes the system as implemented today, including mock assumptions and the intended production replacement points.

## System Overview

Mars V4 validates this end-to-end loop:

```text
delivery simulation
  -> encrypted user-owned data
  -> decentralized storage abstraction
  -> DataAsset registration
  -> programmable licensing
  -> reward distribution
  -> license-gated decryption
  -> frontend ownership dashboard
```

The current implementation is deliberately modular. Each stage has a narrow responsibility and writes JSON outputs that the next stage consumes. This makes the protocol easy to inspect before replacing mock layers with real Walrus, Sui, Seal, zkLogin, and USDC integrations.

## Repository Structure

```text
contracts/
  mars/                  Sui Move package

simulator/               Delivery event simulator

walrus-uploader/         Encryption + mock Walrus upload + mock DataAsset registration

license-flow/            Listing, buyer purchases, DataLicense minting, rewards

seal-mock/               License-gated key release and blob decryption

mars-app/                Expo/React Native frontend with DataDashboard

demo-runner/             Planned one-command orchestration entrypoint
```

### `contracts/`

Contains `contracts/mars`, the Sui Move package. It models the intended on-chain protocol: orders, escrow, data assets, data licenses, reward pools, and mock USDC.

### `simulator/`

Generates realistic delivery datasets. It creates 100 `OrderEvent` objects, groups them into 10 `DataPackage` files, and writes local JSON outputs used by the uploader.

### `walrus-uploader/`

Reads simulator packages, creates role-specific data payloads, encrypts them with AES-256-GCM, writes ciphertext to mock Walrus storage, records key metadata locally, and writes mock DataAsset registration records.

### `license-flow/`

Simulates the payment and licensing economy. It lists DataAssets, simulates AI buyer purchases, mints mock DataLicenses, fills reward pools, distributes rewards, and summarizes contributor earnings.

### `seal-mock/`

Simulates Seal-style access control. It verifies that a buyer owns a valid DataLicense for an asset before releasing decryption metadata, then decrypts the encrypted mock Walrus blob in memory.

### `mars-app/`

Expo/React Native frontend. Existing Customer, Merchant, and Rider flows remain intact. A Data tab reads local mock protocol outputs and displays data ownership, licensing, earnings, and access status.

### `demo-runner/`

Planned orchestration entrypoint for running the full mock protocol pipeline with one command. This directory is referenced as the intended demo wrapper; the current pipeline can also be run with the manual stage commands near the end of this document.

```bash
cd demo-runner
npm install
npm run demo
```

## Detailed Protocol Flow

### Step 1: Simulator Generates Delivery Datasets

`simulator/` creates delivery orders with realistic urban GPS tracks, timestamps, merchants, riders, customers, item lists, delivery amounts, and confirmation signals.

Output:

```text
simulator/output/all_orders.json
simulator/output/packages/package_01.json ... package_10.json
simulator/output/summary.json
```

### Step 2: Walrus Uploader Encrypts Datasets

`walrus-uploader/` reads each `DataPackage` and derives three role-specific datasets:

- `rider_mobility`
- `merchant_operations`
- `consumer_behavior`

Each derived payload is encrypted with AES-256-GCM before storage.

### Step 3: Mock Walrus Blob Storage

Only ciphertext is written to:

```text
walrus-uploader/output/mock-walrus/<blob_id>.bin
```

In mock mode, `blob_id` is `sha256(ciphertext)`.

### Step 4: Mock DataAsset Registration

The uploader writes registration records that mirror the future Sui `DataAsset` registration call. Each DataAsset has exactly one contributor with `weight_bps = 10000`.

Output:

```text
walrus-uploader/output/upload_results.json
walrus-uploader/output/registrations.json
walrus-uploader/output/keys.json
```

### Step 5: Listing + DataLicense Minting

`license-flow/` marks all DataAssets as listed and assigns MVP prices:

- `rider_mobility`: 3 USDC
- `merchant_operations`: 2 USDC
- `consumer_behavior`: 1 USDC

Mock AI buyers purchase assets. Every asset is purchased at least once, and some assets are purchased multiple times. Every purchase mints a mock DataLicense.

### Step 6: Reward Distribution

Each purchase adds payment to the asset reward pool. Since Mars V4 MVP assets are single-owner assets, `distribute_reward()` sends 100% of the reward pool to the single contributor.

### Step 7: License-Gated Decryption

`seal-mock/` checks whether a buyer owns a valid DataLicense for an asset. If valid, it releases the AES key metadata and decrypts the encrypted mock Walrus blob in memory. Invalid buyers, fake buyers, and fake asset IDs receive no key data.

### Step 8: Frontend Ownership Dashboard

`mars-app/` reads the mock JSON outputs and shows a role-specific Data tab:

- Rider sees `rider_mobility`
- Merchant sees `merchant_operations`
- Customer sees `consumer_behavior`

The dashboard summarizes assets, licenses sold, USDC earned, and access-control results.

## Ownership Model

Mars V4 does not use default multi-party split weights for role-specific data. Ownership is direct:

| DataAsset type | Owner | Contributor weight |
| --- | --- | --- |
| `rider_mobility` | Rider | `10000` bps |
| `merchant_operations` | Merchant | `10000` bps |
| `consumer_behavior` | Consumer | `10000` bps |

The current MVP does not create `aggregated_delivery_data` by default and does not use a 50/30/20 split. Aggregated multi-contributor assets may be added later as a separate explicit product path.

## Module Deep Dive

### `contracts/mars`

#### Purpose

The Move package models the future on-chain protocol. It is already buildable with:

```bash
cd contracts/mars
sui move build
```

#### Key Files

```text
contracts/mars/sources/escrow.move
contracts/mars/sources/data_asset.move
contracts/mars/sources/data_license.move
contracts/mars/sources/settlement.move
contracts/mars/sources/usdc.move
```

#### `escrow.move`

Purpose:

- Tracks delivery order lifecycle.
- Holds order payment in escrow.
- Defines `AdminCap` for privileged actions.

Key structs:

- `AdminCap`: capability object held by deployer or secured operations wallet.
- `OrderState`: enum for order lifecycle.
- `Order`: shared object representing a delivery order.

Order state model:

```text
Created
  -> Paid
  -> Accepted
  -> Preparing
  -> PickedUp
  -> Delivered
  -> Completed
```

Dispute/cancel paths:

```text
Created | Paid -> Cancelled
Delivered -> Disputed -> Cancelled | Completed
```

Major functions:

- `create_order(merchant, clock, ctx)`: creates and shares an `Order`.
- `pay_order(order, payment, ctx)`: customer locks USDC into escrow.
- `accept_order(order, ctx)`: merchant accepts paid order.
- `pickup_order(order, ctx)`: rider claims pickup.
- `mark_delivered(order, clock, ctx)`: rider marks delivered.
- `confirm_completed(order, clock, ctx)`: customer confirms or anyone auto-completes after delay.
- `raise_dispute(order, clock, ctx)`: customer opens dispute during dispute window.
- `resolve_dispute(cap, order, ruling, ctx)`: admin resolves dispute.
- `take_amount(order)`: package-only drain for settlement.

Ownership rules:

- Customer controls payment and cancellation before acceptance.
- Merchant controls acceptance/preparation.
- Rider controls delivery completion after pickup.
- AdminCap controls dispute resolution.

#### `data_asset.move`

Purpose:

- Registers encrypted delivery datasets.
- Stores contributor ownership.
- Tracks listing state, price, quality score, and reward pool.

Key structs:

- `Contributor`: address, role bytes, and `weight_bps`.
- `DataAsset`: shared object for encrypted Walrus blob metadata and reward pool.

Major functions:

- `new_contributor(addr, role, weight_bps)`: helper to construct `Contributor`.
- `register_data_asset(blob_id, contributors, data_type, clock, ctx)`: creates and shares a `DataAsset`.
- `set_quality_and_price(cap, asset, score, price, ctx)`: admin/AI-agent price metadata.
- `set_for_sale(asset, for_sale, ctx)`: contributor lists or delists asset.
- `add_to_reward_pool(asset, payment, ctx)`: package-only funding from purchases.
- `distribute_reward(asset, ctx)`: pays contributors based on weights.

Reward logic:

- Current MVP uses one contributor at `10000` bps.
- Distribution supports proportional weights and sends rounding remainder to the final contributor.
- Uploader mock path currently avoids multi-contributor assets.

Security assumptions:

- `add_to_reward_pool` should only be called from purchase flow.
- Contributors must sum to exactly `10000` bps.
- Reward math uses widened intermediate arithmetic in current code to reduce overflow risk.

#### `data_license.move`

Purpose:

- Handles AI buyer purchase of DataAsset access.
- Mints non-publicly-transferable DataLicense objects.
- Records buyer, asset, price, timestamp, and license type.

Key struct:

- `DataLicense`: key object representing purchased access.

Major functions:

- `purchase_access(asset, payment, clock, ctx)`: validates listing, validates exact payment, funds reward pool, mints license.
- `verify_license(asset, license, requester)`: checks asset match, buyer match, and perpetual license type.

Lifecycle:

```text
DataAsset listed
  -> buyer pays exact price
  -> payment enters reward_pool
  -> DataLicense minted to buyer
  -> license can gate key release
```

Ownership rules:

- Current model is "who buys, who uses".
- `DataLicense` does not have public `store`, so public transfer is intentionally restricted.

#### `settlement.move`

Purpose:

- Distributes completed delivery order escrow between merchant and rider.

Major function:

- `settle_order(order, ctx)`: drains escrow from completed order and splits funds.

Reward logic:

- Merchant receives 85%.
- Rider receives remainder, approximately 15%, absorbing rounding dust.

This module handles delivery commerce settlement, not DataAsset licensing rewards.

#### `usdc.move`

Purpose:

- Defines mock USDC for testnet/MVP use.

Key pieces:

- `USDC`: one-time witness.
- `init(witness, ctx)`: creates currency and sends TreasuryCap to deployer.
- `mint_for_testing(cap, amount, ctx)`: mints test USDC.

## Data Lifecycles

### Order Lifecycle

Orders begin as shared `Order` objects, receive customer payment, move through merchant/rider fulfillment states, and end in completion, cancellation, or dispute resolution.

### DataAsset Lifecycle

```text
encrypted payload created
  -> blob_id generated
  -> DataAsset registered
  -> quality/price set
  -> contributor lists asset
  -> buyer purchases license
  -> reward pool funded
  -> rewards distributed
```

### DataLicense Lifecycle

```text
purchase_access()
  -> exact payment accepted
  -> DataLicense object minted
  -> buyer owns license
  -> Seal/mock Seal verifies ownership
  -> key metadata released
```

### `simulator`

#### Purpose

Creates deterministic, realistic delivery data for protocol testing.

#### Inputs

- No external API calls.
- Fixed LA merchant seed locations.
- Fixed riders and customers.
- Seeded random generation.

#### Outputs

```text
simulator/output/all_orders.json
simulator/output/packages/package_01.json ... package_10.json
simulator/output/summary.json
```

#### Core Types

`OrderEvent` includes:

- order/customer/merchant/rider IDs;
- merchant and delivery locations;
- GPS track;
- created/pickup/delivered timestamps;
- delivery duration and distance;
- order amount and items;
- confirmation flags.

`DataPackage` includes:

- package ID;
- rider and merchant IDs;
- 10 orders;
- aggregate metrics;
- created timestamp.

#### GPS Generation Logic

The simulator starts the rider at the merchant location and ends at a random delivery location within a 3-5 km radius. It emits one GPS point every 30 seconds and adds small per-step noise to mimic real movement without teleportation.

#### Anti-Fraud Consistency Rules

- GPS track is spatially consistent.
- All confirmations are true for normal orders.
- `delivered_at = picked_up_at + delivery_time_seconds * 1000`.
- Generated coordinates are finite and within valid lat/lng bounds.

#### Major Functions

- `generateOrders(count, seed)`: creates deterministic `OrderEvent` records.
- `groupIntoPackages(orders, packageSize)`: groups orders into `DataPackage` files.
- `distanceKm(a, b)`: computes route distance using haversine distance.
- GPS helpers generate delivery endpoint and interpolated track.

### `walrus-uploader`

#### Purpose

Converts simulator packages into encrypted role-owned DataAssets.

#### Inputs

```text
../simulator/output/packages/*.json
```

#### Outputs

```text
walrus-uploader/output/upload_results.json
walrus-uploader/output/registrations.json
walrus-uploader/output/keys.json
walrus-uploader/output/mock-walrus/*.bin
```

#### Encryption Flow

Each role-specific payload is encrypted with AES-256-GCM:

```text
JSON payload
  -> random 256-bit key
  -> random 96-bit IV
  -> ciphertext
  -> auth tag
```

Key metadata is stored locally in mock mode:

```text
keyHex
ivHex
authTagHex
```

Future V4/V5 should register key material with Seal rather than storing it locally.

#### Mock Walrus Upload

`uploadEncryptedBlob(ciphertext)`:

- rejects empty ciphertext;
- computes `blob_id = sha256(ciphertext)`;
- writes ciphertext to `output/mock-walrus/<blob_id>.bin`;
- returns `blob_id`.

No plaintext is uploaded. Mock Walrus stores ciphertext only.

#### Mock vs Real Abstraction

`walrus.ts` isolates storage upload behavior. Mock mode is fully offline. Real Walrus integration can replace the adapter without changing encryption, licensing, or frontend consumers.

#### Key Functions

##### `encryptJson(data)`

Input:

- arbitrary JSON-serializable payload.

Output:

- ciphertext buffer;
- `keyHex`;
- `ivHex`;
- `authTagHex`.

Side effects:

- none.

Security assumptions:

- caller uploads only ciphertext;
- key metadata is not committed to public storage in production.

##### `uploadEncryptedBlob(ciphertext)`

Input:

- encrypted buffer.

Output:

- string `blob_id`.

Side effects:

- in mock mode writes encrypted `.bin` file.

Security assumptions:

- ciphertext is non-empty;
- plaintext never reaches storage layer.

##### `registerDataAssetOnSui(params)`

Input:

- `blobId`;
- contributor list;
- data type;
- package/asset metadata.

Output:

- transaction digest or mock digest.

Side effects:

- in mock mode appends registration records;
- in future real mode builds Sui `Transaction`.

Security assumptions:

- contributor weights must sum to `10000`;
- current MVP expects exactly one owner per role-specific asset.

### `license-flow`

#### Purpose

Validates the licensing and reward economy before real Sui transactions.

#### Inputs

```text
../walrus-uploader/output/upload_results.json
../walrus-uploader/output/registrations.json
```

#### Outputs

```text
license-flow/output/listings.json
license-flow/output/data_licenses.json
license-flow/output/reward_distributions.json
license-flow/output/contributor_earnings.json
```

#### Listings

All DataAssets are listed with mock prices:

- `rider_mobility`: 3 USDC
- `merchant_operations`: 2 USDC
- `consumer_behavior`: 1 USDC

#### Purchases

Three mock AI buyers purchase listed assets:

- `ai_company_01`
- `ai_company_02`
- `ai_company_03`

Every asset is purchased at least once. Some assets are purchased more than once.

#### DataLicense Minting

Every purchase mints:

```json
{
  "license_id": "...",
  "buyer_id": "...",
  "asset_id": "...",
  "data_type": "...",
  "usdc_paid": 3,
  "purchased_at": 1779364860000,
  "license_type": "perpetual"
}
```

#### Reward Pools

Each purchase increases the asset reward pool by the paid amount. In the current MVP, each asset has one contributor, so the distribution sends 100% to that contributor.

#### Major Functions

- `listAssetsForSale(registrations)`: creates listing state.
- `simulatePurchases(listings)`: deterministic buyer purchase simulation.
- `mintLicenses(purchases)`: creates mock DataLicense records.
- `distributeRewards(listings, purchases)`: distributes reward pools.
- `summarizeEarnings(distributions)`: aggregates contributor/role earnings.
- `validateFlow(state)`: verifies accounting and reference integrity.

### `seal-mock`

#### Purpose

Validates license-gated encrypted access before real Seal integration.

#### Inputs

```text
../walrus-uploader/output/keys.json
../walrus-uploader/output/upload_results.json
../license-flow/output/data_licenses.json
../walrus-uploader/output/mock-walrus/*.bin
```

#### Outputs

```text
seal-mock/output/access_results.json
seal-mock/output/rejected_access_attempts.json
```

#### Mock Seal Behavior

`seal-mock` mirrors the intended access-control rule:

```text
buyer owns DataLicense for asset
  -> release key metadata
  -> decrypt blob in memory
```

Invalid access attempts do not receive key data.

#### Key Functions

##### `verifyLicenseOwnership(context, buyerId, assetId)`

Input:

- buyer ID;
- asset ID;
- loaded mock protocol context.

Output:

```ts
{
  valid: boolean;
  license_id?: string;
  reason?: string;
}
```

Side effects:

- none.

Security assumptions:

- license ownership is the access predicate;
- referenced asset must exist.

##### `releaseDecryptionKey(context, buyerId, assetId)`

Input:

- buyer ID;
- asset ID.

Output:

- verification result;
- key metadata only if verification succeeds.

Side effects:

- none.

Security assumptions:

- key data is never returned on invalid access.

##### `decryptBlob(assetId, releasedKeyData)`

Input:

- asset ID;
- released key metadata.

Output:

- decrypted JSON in memory;
- data type;
- order count.

Side effects:

- reads encrypted mock Walrus blob.

Security assumptions:

- decryption happens in memory only;
- output files contain summaries, not plaintext datasets.

#### Rejected Access Attempts

The mock tests:

- buyer without license;
- fake asset ID;
- fake buyer ID.

Each rejected attempt records only buyer, asset, reason, and rejected flag.

### `mars-app`

#### Purpose

Demonstrates the Mars V4 protocol state to users without real Sui, Walrus, Seal, or zkLogin integration.

#### Key Files

```text
mars-app/components/DataDashboard.tsx
mars-app/services/mockDataService.ts
mars-app/app/rider.tsx
mars-app/app/merchant.tsx
mars-app/app/customer/index.tsx
```

#### DataDashboard

`DataDashboard` receives:

```ts
{
  role: "rider" | "merchant" | "consumer";
  userId: string;
}
```

It displays:

- total DataAssets;
- licenses sold;
- USDC earned;
- access grants;
- asset list;
- recent license history;
- earnings summary;
- Seal mock access-control status.

#### Role-Specific Filtering

`mockDataService` maps roles to data types:

| Frontend role | Data type |
| --- | --- |
| Rider | `rider_mobility` |
| Merchant | `merchant_operations` |
| Customer | `consumer_behavior` |

The service filters out anything outside the three V4 role-owned data types. It does not display `aggregated_delivery_data`.

#### Mock JSON Integration

The app reads local mock JSON outputs:

- uploader results;
- listings;
- licenses;
- reward distributions;
- earnings;
- Seal access results.

This is intentionally local-only for demo mode. Future production UI should read indexed Sui/Walrus/Seal state through backend or client SDKs.

### `demo-runner`

#### Purpose

Planned one-command orchestration for the full mock pipeline. It should wrap the same stage commands listed in this document.

#### Pipeline Order

`npm run demo` is expected to run:

1. simulator generation;
2. walrus-uploader mock upload;
3. license-flow run;
4. seal-mock run;
5. consistency checks.

#### Verification Checks

The orchestration layer should validate:

- 100 simulated orders;
- 30 encrypted DataAssets;
- 30 registrations;
- at least 30 DataLicenses;
- total distributions equal total buyer payments;
- every valid license decrypts;
- invalid access attempts are rejected.

## JSON Schema Documentation

### `all_orders.json`

Array of `OrderEvent`.

Important fields:

- `order_id`: unique delivery order ID.
- `customer_id`: customer identity.
- `merchant_id`: merchant identity.
- `rider_id`: rider identity.
- `merchant_location`: pickup GPS point.
- `delivery_location`: delivery GPS point.
- `gps_track`: rider movement path, one point every 30 seconds.
- `order_created_at`: unix ms timestamp.
- `picked_up_at`: unix ms timestamp.
- `delivered_at`: unix ms timestamp.
- `delivery_time_seconds`: duration.
- `distance_km`: route distance.
- `order_amount_usdc`: mock order value.
- `items`: ordered items.
- `confirmations`: customer, merchant, and rider confirmation flags.

### `upload_results.json`

Array of encrypted DataAsset upload records.

Important fields:

- `asset_id`: role-specific asset ID.
- `package_id`: source simulator package.
- `contributor_id`: owner/contributor identity.
- `blob_id`: mock Walrus blob ID.
- `data_type`: role-owned data type.
- `ciphertext_bytes`: encrypted blob size.
- `key_id`: local key metadata reference.

### `data_licenses.json`

Array of mock DataLicenses.

Important fields:

- `license_id`: unique license ID.
- `buyer_id`: AI buyer.
- `asset_id`: licensed DataAsset.
- `data_type`: licensed data type.
- `usdc_paid`: purchase price.
- `purchased_at`: unix ms timestamp.
- `license_type`: currently `perpetual`.

### `contributor_earnings.json`

Aggregated reward summary.

Important fields:

- `contributors`: earnings by contributor ID.
- `roles`: earnings by role.
- `total_usdc`: amount earned.
- `licenses_sold`: count of earning events.

### `access_results.json`

Successful access-control and decryption summaries.

Important fields:

- `buyer_id`: buyer that accessed data.
- `asset_id`: accessed asset.
- `license_id`: license used for access.
- `blob_id`: encrypted blob.
- `access_granted`: always true for this file.
- `decrypted_successfully`: true when AES-GCM decrypt succeeds.
- `data_type`: decrypted data type.
- `order_count`: number of orders in decrypted payload.
- `verified_at`: unix ms timestamp.

This file intentionally does not include plaintext order data or key material.

## Function-Level Reference

### `encryptJson()`

Located in `walrus-uploader/src/crypto.ts`.

- Input: JSON-serializable data.
- Output: ciphertext, key hex, IV hex, auth tag hex.
- Side effects: none.
- Security assumption: plaintext is encrypted before storage; key metadata is mock-local only.

### `purchase_access()`

Located in `contracts/mars/sources/data_license.move`.

- Input: mutable DataAsset, exact USDC payment coin, Clock, TxContext.
- Output: minted DataLicense object transferred to buyer.
- Side effects: funds reward pool and records license.
- Security assumption: buyer sends exact price; access is later gated by DataLicense ownership.

### `distribute_reward()`

Located in `contracts/mars/sources/data_asset.move`.

- Input: mutable DataAsset and TxContext.
- Output: USDC payouts to contributors.
- Side effects: drains reward pool.
- Security assumption: contributor weights sum to `10000`; current MVP assets use one contributor at `10000`.

### `verifyLicenseOwnership()`

Located in `seal-mock/src/verifier.ts`.

- Input: context, buyer ID, asset ID.
- Output: valid flag, license ID, or rejection reason.
- Side effects: none.
- Security assumption: valid DataLicense ownership is required before key release.

### `decryptBlob()`

Located in `seal-mock/src/decrypt.ts`.

- Input: asset ID and released key metadata.
- Output: decrypted JSON in memory plus payload shape summary.
- Side effects: reads encrypted blob from mock Walrus.
- Security assumption: caller obtained key data through verified access.

## Mock vs Future Production Architecture

| Layer | Current mock | Future production |
| --- | --- | --- |
| Storage | Mock Walrus `.bin` files | Real Walrus blobs |
| Registration | Local JSON records | Real Sui `DataAsset` objects |
| Licensing | Local JSON DataLicenses | Real Sui `DataLicense` objects |
| Payments | Mock USDC accounting | Real USDC/Sui coin transfers |
| Access control | `seal-mock` key release | Seal integration |
| Identity | Mock IDs | zkLogin / wallet identities |
| Frontend data | Local JSON imports | Indexed protocol state / SDK reads |

## Security Model

### Current Protections

- Plaintext simulator data is never uploaded to mock Walrus.
- Encrypted blobs use AES-256-GCM.
- Mock Walrus stores ciphertext only.
- Mock Seal releases key metadata only for valid DataLicense ownership.
- Seal mock decrypts data in memory and writes only access summaries.
- Frontend dashboard displays summaries, not decrypted datasets.

### Mock Limitations

- Key metadata is stored locally in `keys.json`.
- Buyer identity is a string, not a wallet signature.
- DataAsset registration is JSON, not a live Sui object.
- DataLicense ownership is JSON, not on-chain object ownership.
- USDC payments are numeric accounting, not real coin movement.

These limitations are intentional for protocol validation. Each has a clear production replacement path.

## Demo Walkthrough

The planned one-command demo is:

```bash
cd demo-runner
npm install
npm run demo
```

During `npm run demo`, the system should:

1. Generate delivery data in `simulator/output`.
2. Encrypt role-specific datasets in `walrus-uploader`.
3. Write mock Walrus ciphertext blobs.
4. Write mock DataAsset registration records.
5. List assets and simulate AI buyer purchases.
6. Mint DataLicenses.
7. Distribute rewards to contributors.
8. Verify license ownership through Seal mock.
9. Decrypt blobs in memory for valid license holders.
10. Produce frontend-readable summaries.

Expected current mock state:

- 100 simulated orders
- 30 encrypted DataAssets
- 41 DataLicenses
- 81 USDC mock buyer volume
- 81 USDC mock rewards distributed
- 41 successful access grants

Current manual equivalent:

```bash
cd simulator && npm install && npm run generate
cd ../walrus-uploader && npm install && npm run upload:mock
cd ../license-flow && npm install && npm run run
cd ../seal-mock && npm install && npm run run
cd ../mars-app && npm install && npm run start
```

## Development Commands

Run stages manually:

```bash
cd simulator
npm install
npm run generate
```

```bash
cd walrus-uploader
npm install
npm run upload:mock
```

```bash
cd license-flow
npm install
npm run run
```

```bash
cd seal-mock
npm install
npm run run
```

```bash
cd mars-app
npm install
npm run start
```

## Design Rationale

Mars separates data generation, encryption, licensing, payment accounting, access control, and UI into independent stages. This makes it possible to validate each boundary:

- Does generated data have enough realism?
- Is plaintext kept out of storage?
- Are ownership records unambiguous?
- Are licenses minted only after purchase?
- Are rewards economically conserved?
- Are keys released only to licensed buyers?
- Can users understand their assets and earnings?

The mock pipeline answers those questions before the project takes on the complexity of production Sui, Walrus, Seal, zkLogin, and real stablecoin settlement.
