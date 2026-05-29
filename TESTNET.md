# Mars Testnet Runbook

This runbook is real-testnet only. The simulator generates synthetic delivery
activity, but Sui objects, Walrus blobs, Seal key release, TestUSDC minting, and
DataLicense purchases all run against testnet infrastructure.

## Required Tools

```bash
node --version   # >= 20
pnpm --version   # >= 9
python3 --version
sui --version    # Sui CLI for wallet management and contract deployment
```

Walrus CLI is **not** required — uploads use the Walrus HTTP Publisher API directly.

## Required Environment

Create:

```bash
walrus-uploader/.env
seal-access/.env
contracts/.env
```

Use the corresponding `.env.example` files. Required values:

```bash
# Sui
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SUI_PRIVATE_KEY=suiprivkey...       # admin wallet; defaults to active Sui CLI wallet if unset
SUI_PACKAGE_ID=0x...                # or set via contracts/mars/Published.toml

# Walrus HTTP Publisher (no CLI required)
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_EPOCHS=2

# Seal
SEAL_KEY_SERVER_OBJECT_ID=0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98
SEAL_AGGREGATOR_URL=https://seal-aggregator-testnet.mystenlabs.com
SEAL_THRESHOLD=1

# Required for pricing:apply and contracts:license
ADMIN_CAP_ID=0x...

# Required for contracts:license (mints TestUSDC for the buyer)
USDC_TREASURY_CAP_ID=0x...
```

If `SUI_PRIVATE_KEY` / `BUYER_PRIVATE_KEY` are unset, scripts fall back to the
active Sui CLI wallet. Do not use a mainnet wallet.

## Build And Test Contracts

```bash
cd contracts/mars
sui move build
sui move test
```

Publish or use the package recorded in `contracts/mars/Published.toml`. The
published package must include:

- `data_asset` — `register_data_shard`, `set_quality_and_price`
- `data_license` — `purchase_access`, `seal_approve`
- `settlement`, `escrow`, `usdc`

## Run Pipeline

```bash
pnpm simulator:wallets     # generate 640 Ed25519 testnet wallets
pnpm simulator:generate    # generate PersonalDataAssets + delivery orders
pnpm walrus:upload         # aggregate shards, encrypt, upload, register on Sui + Seal
pnpm pricing:testnet       # AI pricing evaluation + on-chain price submission
pnpm contracts:license     # purchase DataLicenses for all shards
pnpm seal:decrypt          # Seal-gated AES key release + blob decryption
pnpm aggregator:run        # aggregate licensed data into AI-ready datasets
pnpm ai:train              # train demand and dispatch models
```

The full wrapper is:

```bash
pnpm mars:e2e:testnet
```

## Expected Testnet Artifacts

After `pnpm walrus:upload`:

- Simulated listing authorizations: `walrus-uploader/output/listing_authorizations.json`
- Aggregated shard JSON: `walrus-uploader/output/shards/`
- Contributor accounting: `walrus-uploader/output/contributor_accounting.json`
- Encrypted shard blobs: `walrus-uploader/output/encrypted/`
- Upload manifest (real Walrus blob IDs): `walrus-uploader/output/upload_manifest.json`
- Sui DataAsset object IDs + commitment roots: `contracts/output/data_asset_registry.json`
- Seal AES key bundles: `seal-access/output/seal_key_registry.json`

After `pnpm pricing:testnet`:

- AI pricing report: `ai-pricing/output/pricing_report.json`
- Sui pricing receipt: `ai-pricing/output/pricing_apply_receipt.json`

After `pnpm contracts:license`:

- Sui DataLicense IDs: `contracts/output/data_license_registry.json`

## Unauthorized Access Validation

To validate denial for one shard, run:

```bash
pnpm --dir seal-access decrypt -- --user-id <shard_id>
```

with `BUYER_PRIVATE_KEY` set to a funded Sui testnet wallet that does **not** own
the DataLicense. The failure must come from Seal / Sui DataLicense verification.
`seal_access_receipt.json` should record `access_granted: false`.

## Gas Management

The admin wallet (`SUI_PRIVATE_KEY`) needs SUI for gas on every Sui transaction.
If the wallet runs low during `walrus:upload` (batched DataAsset registration) or
`pricing:apply`, request SUI from the testnet faucet:

```bash
curl -X POST https://faucet.testnet.sui.io/v2/gas \
  -H "Content-Type: application/json" \
  -d '{"FixedAmountRequest":{"recipient":"<ADMIN_ADDRESS>"}}'
```

Each `register_data_shard` PTB (up to 90 shards) consumes ~0.2 SUI.
`set_quality_and_price` for all shards in one PTB consumes ~0.05 SUI.
