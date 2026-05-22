# Mars Sui Testnet Runbook

This guide moves the current Mars mock protocol toward a Sui Testnet run:

1. publish the Move package;
2. upload encrypted DataAssets;
3. register DataAssets on Sui;
4. price and list the assets;
5. mint mock USDC;
6. purchase DataLicenses;
7. distribute DataAsset rewards.

The frontend still reads local JSON outputs. Real frontend indexing is a later integration step.

## 1. Install and Configure Sui

```bash
curl -sSfL https://raw.githubusercontent.com/Mystenlabs/suiup/main/install.sh | sh
suiup install sui@testnet
sui --version
sui client
```

When prompted for a fullnode URL, use:

```text
https://fullnode.testnet.sui.io:443
```

Then fund the active address:

```bash
sui client active-env
sui client active-address
sui client faucet
sui client balance
```

## 2. Publish the Move Package

```bash
cd contracts/mars
sui move build
sui client publish --json > ../../publish-testnet.json
```

Extract the IDs needed by the TypeScript runner:

```bash
cd ../../walrus-uploader
npm run chain:extract-publish -- ../publish-testnet.json
```

Copy the printed values into `walrus-uploader/.env`.

Required values:

```env
SUI_NETWORK=testnet
PACKAGE_ID=0x...
ADMIN_CAP_ID=0x...
USDC_TREASURY_CAP_ID=0x...
SUI_PRIVATE_KEY=suiprivkey...
SUI_MOCK=false
```

For a one-wallet smoke test, set all contributor addresses to the same address as
the private key:

```env
CONTRIBUTOR_RIDER_ADDRESS=0x...
CONTRIBUTOR_MERCHANT_ADDRESS=0x...
CONTRIBUTOR_CONSUMER_ADDRESS=0x...
```

## 3. Optional Walrus Testnet Setup

If you want real Walrus blobs, install and configure Walrus:

```bash
suiup install walrus
curl --create-dirs https://docs.wal.app/setup/client_config.yaml -o ~/.config/walrus/client_config.yaml
walrus info --context testnet
walrus get-wal
```

Use this in `.env`:

```env
WALRUS_MOCK=false
WALRUS_CONTEXT=testnet
WALRUS_EPOCHS=5
WALRUS_CLI_PATH=walrus
```

For a Sui-only smoke test, keep Walrus local:

```env
WALRUS_MOCK=true
```

## 4. Generate Data and Register Assets

Generate the simulator output:

```bash
cd ../simulator
npm run generate
```

Register DataAssets with real Sui and mock Walrus:

```bash
cd ../walrus-uploader
npm run upload:sui-testnet
```

Register DataAssets with real Sui and real Walrus:

```bash
cd ../walrus-uploader
npm run upload:testnet
```

Outputs:

```text
walrus-uploader/output/upload_results.json
walrus-uploader/output/registrations.json
walrus-uploader/output/keys.json
```

`registrations.json` now includes `sui_object_id` for each chain DataAsset.

## 5. Run the On-Chain Sample Flow

The shortest one-wallet smoke path:

```bash
cd walrus-uploader
CHAIN_MAX_ASSETS=1 npm run chain:run-sample
```

That command runs:

```text
mint-usdc -> price-assets -> list-assets -> purchase-sample -> distribute-rewards
```

You can run the stages separately:

```bash
npm run chain:mint-usdc
npm run chain:price-assets
npm run chain:list-assets
npm run chain:purchase-sample
npm run chain:distribute-rewards
```

Useful targeting variables:

```bash
ASSET_ID=package_01_rider_mobility npm run chain:prepare-assets
CHAIN_MAX_ASSETS=3 npm run chain:purchase-sample
USDC_MINT_AMOUNT=100 npm run chain:mint-usdc
```

Chain runner outputs are written to:

```text
walrus-uploader/output/testnet/
```

## 6. Important Limits

- Testnet state can be wiped. Do not treat Testnet objects as durable production records.
- Walrus blobs are public and discoverable. Keep encrypting payloads before upload.
- `keys.json` is mock-local key material for development only.
- The current app still reads local JSON outputs; production UI needs Sui/Walrus/Seal indexing.
- If contributor addresses differ, `list-assets` must be run by each contributor wallet because `set_for_sale` checks `ctx.sender()`.

## Reference Docs

- Sui install/configure/faucet/publish: https://docs.sui.io/getting-started/onboarding/hello-world
- Sui CLI: https://docs.sui.io/references/cli
- Walrus getting started: https://docs.wal.app/docs/getting-started
- Walrus storage operations: https://docs.wal.app/docs/system-overview/operations
