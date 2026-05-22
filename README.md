# Mars

**User-owned delivery data infrastructure for AI.**

Mars is a decentralized delivery + data licensing protocol on Sui. It turns real delivery activity into encrypted, role-owned data assets that riders, merchants, and consumers can license to AI buyers.

## Problem

Traditional delivery platforms capture nearly all data created by the network:

- riders generate mobility and route data, but do not own or monetize it;
- merchants generate operations and demand data, but have little control over its reuse;
- customers generate behavior and preference data, but rarely grant explicit access;
- AI companies increasingly need real-world mobility, logistics, and commerce datasets.

Mars asks a simple question: what if delivery data became a programmable asset owned by the people who created it?

## Solution

Mars creates a licensing layer for delivery data:

- **Role-owned encrypted data assets**: each dataset is encrypted before storage and assigned to its rightful owner.
- **Programmable licensing**: AI buyers purchase access through DataLicenses.
- **Contributor rewards**: license payments flow back to the data owner.
- **License-gated access control**: decryption metadata is released only after license ownership is verified.

## Architecture Overview

```text
simulator
  -> encrypted DataAssets
  -> Walrus storage abstraction
  -> Sui DataAsset registration
  -> DataLicense purchases
  -> reward distribution
  -> Seal-style access control
  -> frontend dashboard
```

## Ownership Model

Mars V4 uses role-specific ownership:

| Data type | Owner |
| --- | --- |
| `rider_mobility` | Rider |
| `merchant_operations` | Merchant |
| `consumer_behavior` | Consumer |

There is no aggregated multi-owner dataset in the current MVP. Each DataAsset has exactly one contributor with `weight_bps = 10000`.

## Main Modules

- `contracts/mars` — Sui Move contracts for DataAssets, DataLicenses, escrow, settlement, and mock USDC.
- `simulator` — deterministic delivery event simulator that produces 100 mock orders.
- `walrus-uploader` — encrypts role-specific datasets, writes mock Walrus blobs, and records mock DataAsset registrations.
- `license-flow` — simulates asset listing, AI buyer purchases, DataLicense minting, and reward distribution.
- `seal-mock` — verifies DataLicense ownership and releases decryption metadata in mock Seal mode.
- `mars-app` — Expo/React Native app with Rider, Merchant, Customer, and Data dashboard views.
- `demo-runner` — planned one-command orchestration for the full mock protocol demo.

## Current Mock Protocol Capabilities

- [x] Simulated delivery generation
- [x] Encrypted blob generation
- [x] Mock decentralized storage
- [x] DataAsset registration
- [x] DataLicense minting
- [x] Reward distribution
- [x] License-gated decryption
- [x] Frontend ownership dashboard

## Demo

Planned one-command demo:

```bash
cd demo-runner
npm install
npm run demo
```

Current manual equivalent:

```bash
cd simulator && npm install && npm run generate
cd ../walrus-uploader && npm install && npm run upload:mock
cd ../license-flow && npm install && npm run run
cd ../seal-mock && npm install && npm run run
cd ../mars-app && npm install && npm run start
```

Then open `mars-app` and navigate to the Rider, Merchant, or Customer **Data** tabs to see role-owned assets, licenses sold, earnings, and Seal-style access verification.

## Sui Testnet

The mock protocol now has a Sui Testnet runbook and runner scripts for publishing the Move package, registering encrypted DataAssets, pricing/listing assets, minting mock USDC, purchasing DataLicenses, and distributing DataAsset rewards.

See [`TESTNET.md`](./TESTNET.md).

Current mock demo numbers:

- 100 simulated orders
- 30 encrypted DataAssets
- 41 DataLicenses
- 81 USDC mock volume
- 41 successful access grants

## Security Notes

- Plaintext datasets are never uploaded.
- Data packages are encrypted with AES-256-GCM before mock Walrus storage.
- Decryption metadata is stored separately in mock mode.
- Mock Seal releases keys only after DataLicense ownership verification.
- Mock Walrus stores encrypted ciphertext only.

## Roadmap

- Real Walrus integration
- Real Sui transactions
- zkLogin identity
- Real USDC settlement
- Seal integration
- Production DataMarketplace

## Tech Stack

- Sui Move
- TypeScript
- Expo / React Native
- Walrus
- Seal
- Zustand
