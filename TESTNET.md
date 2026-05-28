# Mars Testnet Runbook

This runbook is real-testnet only. The simulator generates synthetic delivery
activity, but Sui objects, Walrus blobs, Seal key release, TestUSDC minting, and
DataLicense purchases all run against testnet infrastructure.

## Required Tools

```bash
node --version
pnpm --version
python3 --version
sui --version
walrus --version
```

## Required Environment

Create:

```bash
walrus-uploader/.env
seal-access/.env
contracts/.env
```

Use the corresponding `.env.example` files. Required deployment values:

```bash
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SUI_PACKAGE_ID=0x...
ADMIN_CAP_ID=0x...
USDC_TREASURY_CAP_ID=0x...
TESTUSDC_TYPE=0x...::usdc::USDC
WALRUS_NETWORK=testnet
WALRUS_CONTEXT=testnet
SEAL_NETWORK=testnet
BUYER_ADDRESS=0x...
```

If `BUYER_PRIVATE_KEY` or `SUI_PRIVATE_KEY` is unset, scripts use the active Sui
CLI wallet. Do not use a mainnet wallet.

## Build And Test Contracts

```bash
cd contracts/mars
sui move build
sui move test
```

Publish or use the package recorded in `contracts/mars/Published.toml`. The
published package must include:

- `data_asset`
- `data_license`
- `settlement`
- `escrow`
- `usdc`

## Run Pipeline

```bash
pnpm simulator:wallets
pnpm simulator:generate
pnpm walrus:upload
pnpm pricing:evaluate
pnpm pricing:apply
pnpm contracts:license
pnpm seal:decrypt
pnpm aggregator:run
pnpm ai:train
```

The full wrapper is:

```bash
pnpm mars:e2e:testnet
```

## Expected Testnet Artifacts

- Real Walrus `blob_id` values in `walrus-uploader/output/upload_manifest.json`
- Real Sui `DataAsset` IDs in `contracts/output/data_asset_registry.json`
- AI pricing report in `ai-pricing/output/pricing_report.json`
- Sui pricing receipt in `ai-pricing/output/pricing_apply_receipt.json`
- Real Sui `DataLicense` IDs in `contracts/output/data_license_registry.json`
- Seal key bundle metadata in `seal-access/output/seal_key_registry.json`
- Seal access receipt in `seal-access/output/seal_access_receipt.json`
- Decrypted buyer-local dataset in `seal-access/output/decrypted_dataset.json`
- AI-ready datasets in `aggregator/output/`
- AI predictions and dispatch assignment in `ai-agent/**/output/`

## Unauthorized Access Validation

To validate denial, run `pnpm seal:decrypt` with `BUYER_PRIVATE_KEY` set to a
funded Sui testnet wallet that does not own the DataLicense. The failure must
come from Seal/Sui DataLicense verification, and `seal_access_receipt.json`
should record `access_granted: false`.
