# Mars Submission

Mars is a Sui + Walrus + Seal protocol for contributor-owned gig economy data. It turns rider, merchant, and consumer activity into encrypted on-chain DataAssets, sells access through DataLicense NFTs, and feeds licensed data into AI demand prediction and dispatch workflows.

## Judge Quick Links

- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Testnet runbook: [TESTNET.md](TESTNET.md)
- Project logo: [mars-logo.png](mars-marketplace-design/public/mars-logo.png)
- Recommended track: Walrus
- Public GitHub repo: https://github.com/LagomX/SUIMars
- Sui package: `0xe6109124a4fd79a577eae339274a3150b0ecb11760af669f02debdf538d4a7d0`
- Testnet receipt: [testnet-rehearsal.json](receipts/testnet-rehearsal.json)
- Demo video: `TODO: add video link`
- Live marketplace: https://sui-mars.vercel.app
- Repository commit: `TODO: add final commit hash after committing submission edits`

## What To Review

1. Move contracts in `contracts/mars/sources/`
   - `data_asset.move`: registers encrypted Walrus-backed DataAssets and commitment roots.
   - `data_license.move`: mints DataLicense NFTs and exposes `seal_approve` for Seal key-server authorization.
   - `escrow.move`, `settlement.move`, `usdc.move`: delivery payment flow and mock TestUSDC.

2. Testnet data pipeline
   - `simulator/`: creates 640 synthetic contributors and delivery events.
   - `walrus-uploader/`: aggregates, encrypts, uploads to Walrus, registers DataAssets on Sui, and stores Seal key bundles.
   - `seal-access/`: proves licensed buyers can decrypt and unlicensed wallets cannot.

3. AI buyer workflow
   - `ai-pricing/`: scores and prices DataAssets.
   - `aggregator/`: converts decrypted licensed shards into AI-ready datasets.
   - `ai-agent/`: trains demand prediction and produces dispatch assignments.

4. Product surfaces
   - `mars-marketplace-design/`: Next.js marketplace for browsing and buying datasets.
   - `mars-app/`: Expo contributor dashboard for rider, merchant, and customer views.

## Local Verification

```bash
pnpm --dir contracts typecheck
pnpm --dir walrus-uploader typecheck
pnpm --dir seal-access typecheck
pnpm --dir mars-marketplace-design exec tsc --noEmit
pnpm --dir mars-marketplace-design lint
pnpm --dir mars-marketplace-design build

cd contracts/mars
sui move test
```

Current local verification status:

| Check | Status |
|---|---|
| Move unit tests | Pass, 22/22 |
| contracts TypeScript | Pass |
| walrus-uploader TypeScript | Pass |
| seal-access TypeScript | Pass |
| marketplace TypeScript | Pass |
| marketplace production build | Pass |
| marketplace lint | Pass |

## Testnet Dress Rehearsal

Use a testnet-only wallet. Never use a mainnet wallet or commit private keys.

```bash
cp walrus-uploader/.env.example walrus-uploader/.env
cp seal-access/.env.example seal-access/.env
cp contracts/.env.example contracts/.env

# Fill ADMIN_CAP_ID, USDC_TREASURY_CAP_ID, TESTUSDC_TYPE, and optional buyer/admin keys.
pnpm mars:e2e:testnet
```

After a full run, record the public receipts here:

| Artifact | Value |
|---|---|
| Admin address | `0x48ab56344e49f7dde97c5c9e1934424d82e0cee05164339d4cd6726314a128fe` |
| Buyer address | `0x48ab56344e49f7dde97c5c9e1934424d82e0cee05164339d4cd6726314a128fe` |
| Sui package ID | `0xe6109124a4fd79a577eae339274a3150b0ecb11760af669f02debdf538d4a7d0` |
| Example DataAsset object | `0x49bf2c59966e3dbcbb79b7dc97dcb4d48298f123fe4dc5c677974c56f27eb43e` |
| Example DataLicense object | `0x9291b6f7f33611a58d8e8702439ec79df377dbd68451d752fa472e85c361b602` |
| Example Walrus blob ID | `h-DPMWCdUO-zL-Edj-A7hjhRpYHHNqBBUfJfyf7gvKc` |
| Example license purchase transaction digest | `9Liu56bVqqBi45ebKjzQ5osTqt7gmJcKiR9zPBFcRP8D` |
| Seal decrypt receipt | `receipts/testnet-rehearsal.json`, 640 assets decrypted across 3 licensed shards |
| Unauthorized decrypt receipt | `receipts/testnet-rehearsal.json`, `unauthorized_access_check.access_granted=false` |

## Demo Script

1. Open the marketplace and show the dataset catalog, dataset detail page, purchase state, and protocol status page.
2. Show the Sui package and one DataAsset object with commitment roots.
3. Show a DataLicense purchase transaction and the buyer-owned license object.
4. Run or display the Seal decrypt receipt proving the buyer can access the AES key only after license verification.
5. Show the generated demand prediction CSV, model output, and dispatch assignment JSON.

## Submission Notes

- Generated outputs and wallets are intentionally gitignored because they may contain private keys, encrypted payloads, model artifacts, or large local data.
- Public receipts should be copied into this document or a separate sanitized `receipts/` folder before final submission.
- The aggregator uses only Python standard library dependencies; the AI model requires `lightgbm` and `scikit-learn`.
