# Sui Overflow Submission Form

Use this as the copy source for the DeepSurge/Sui Overflow submission form.

## Project Name

Mars

## Primary Track

Walrus

## Short Description

Mars is a data ownership protocol for the gig economy. It lets riders, merchants, and consumers turn their activity data into encrypted Sui DataAssets, license that data to AI buyers through DataLicense NFTs, and earn revenue when their data is used.

## Full Description

Mars solves a real-world data ownership problem in gig work: platforms capture valuable delivery, merchant, and consumer behavior data, while the people who generate it receive none of the upside. Mars uses Sui, Walrus, and Seal to turn that data into contributor-owned, encrypted, verifiable assets.

Contributors opt in, their activity is aggregated into dataset shards, and each shard is encrypted, uploaded to Walrus, and anchored on Sui as a DataAsset with commitment roots for content, contributor accounting, and authorization records. AI buyers purchase access through on-chain DataLicense NFTs. Seal key servers only release the decryption key after verifying that the buyer owns a valid license for the exact DataAsset.

The project includes Move contracts, a testnet pipeline, Walrus upload and Seal decryption, AI pricing, demand prediction, dispatch optimization, a marketplace frontend, and an Expo contributor dashboard.

## Why It Matters

AI companies need high-quality, consented, verifiable data for logistics and demand modeling. Gig workers, merchants, and consumers generate that data every day but usually have no ownership, consent layer, or revenue share. Mars creates a marketplace where data provenance, consent, payment, and access control are enforced by Sui, Walrus, and Seal instead of a centralized platform.

## Sui / Walrus / Seal Usage

- Sui Move contracts register DataAssets, mint DataLicense NFTs, route USDC payments, and enforce Seal access policy.
- Walrus stores encrypted dataset shards as decentralized blobs.
- Seal protects AES keys and releases them only when `seal_approve` verifies license ownership on Sui.
- Sui object IDs and commitment roots let buyers verify provenance and tamper evidence.

## Deployment

- Network: Sui testnet
- Package ID: `0xe6109124a4fd79a577eae339274a3150b0ecb11760af669f02debdf538d4a7d0`
- Marketplace URL: `TODO: add deployed URL`
- Demo video: `TODO: add YouTube URL`
- GitHub repo: https://github.com/LagomX/SUIMars
- Project logo: `mars-marketplace-design/public/mars-logo.png`
- Testnet receipt: `receipts/testnet-rehearsal.json`

## Demo Flow

1. Open the marketplace and show dataset discovery, quality scores, pricing, and protocol status.
2. Open one dataset and explain its Sui DataAsset, Walrus blob, and commitment roots.
3. Show a DataLicense purchase and the buyer-owned license object.
4. Show Seal-gated decryption succeeding for the licensed buyer.
5. Show the AI buyer output: demand prediction dataset, trained model output, and dispatch assignment.

## Verification Commands

```bash
pnpm --dir contracts typecheck
pnpm --dir walrus-uploader typecheck
pnpm --dir seal-access typecheck
pnpm --dir mars-marketplace-design lint
pnpm --dir mars-marketplace-design exec tsc --noEmit
pnpm --dir mars-marketplace-design build

cd contracts/mars
sui move test
```

## Receipt Checklist

Fill these after the final testnet run:

- Admin address: `0x48ab56344e49f7dde97c5c9e1934424d82e0cee05164339d4cd6726314a128fe`
- Buyer address: `0x48ab56344e49f7dde97c5c9e1934424d82e0cee05164339d4cd6726314a128fe`
- Example DataAsset object: `0x49bf2c59966e3dbcbb79b7dc97dcb4d48298f123fe4dc5c677974c56f27eb43e`
- Example DataLicense object: `0x9291b6f7f33611a58d8e8702439ec79df377dbd68451d752fa472e85c361b602`
- Example Walrus blob ID: `h-DPMWCdUO-zL-Edj-A7hjhRpYHHNqBBUfJfyf7gvKc`
- Example license purchase transaction digest: `9Liu56bVqqBi45ebKjzQ5osTqt7gmJcKiR9zPBFcRP8D`
- Seal decrypt receipt: `receipts/testnet-rehearsal.json`, 640 assets decrypted across 3 licensed shards
- Unauthorized decrypt receipt: `receipts/testnet-rehearsal.json`, `unauthorized_access_check.access_granted=false`
