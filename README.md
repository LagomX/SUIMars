# Mars

Mars turns contributor-owned real-world activity into licensed AI datasets.

The current repository runs the protocol against Sui testnet, Walrus testnet,
Seal key servers, and the Mars TestUSDC Move module. The simulator still
generates synthetic delivery activity for riders, merchants, and consumers; all
infrastructure after simulation is real testnet infrastructure.

## Protocol Flow

1. Generate Sui testnet-compatible contributor wallets.
2. Generate structured delivery events and PersonalDataAssets.
3. Encrypt each dataset locally with AES-256-GCM.
4. Upload ciphertext to Walrus testnet and receive real Walrus blob IDs.
5. Register DataAssets on Sui testnet.
6. Score and price DataAssets with the protocol-side AI pricing agent.
7. Submit prices to Sui testnet with `set_quality_and_price`.
8. List assets, mint TestUSDC, and purchase a real DataLicense.
9. Request the AES key through Seal using `data_license::seal_approve`.
10. Decrypt licensed Walrus blobs locally.
11. Aggregate licensed data into AI-ready datasets.
12. Train demand and dispatch models.

## Prerequisites

```bash
node --version   # >= 20
pnpm --version   # >= 9
python3 --version
sui --version
walrus --version
```

Install dependencies:

```bash
pnpm install
pnpm --dir simulator install
pnpm --dir walrus-uploader install
pnpm --dir seal-access install
pnpm --dir contracts install
python3 -m pip install -r aggregator/requirements.txt
python3 -m pip install -r ai-agent/requirements.txt
```

## Testnet Configuration

Copy and fill the real testnet env examples:

```bash
cp walrus-uploader/.env.example walrus-uploader/.env
cp seal-access/.env.example seal-access/.env
cp contracts/.env.example contracts/.env
```

Required for the purchase flow:

```bash
ADMIN_CAP_ID=0x...
USDC_TREASURY_CAP_ID=0x...
BUYER_PRIVATE_KEY=suiprivkey... # optional if active Sui CLI wallet is the buyer/admin
```

Walrus must be installed, configured for testnet, and funded. Sui must have a
funded testnet signer. Seal settings default to the public testnet key server.

## Validate

```bash
pnpm --dir simulator exec tsc --noEmit
pnpm walrus:typecheck
pnpm seal:typecheck
pnpm contracts:typecheck

cd contracts/mars
sui move build
sui move test
```

## Run The Real Testnet Pipeline

For a one-command run:

```bash
pnpm mars:e2e:testnet
```

Or step by step:

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

## Outputs

| Path | Contents |
|---|---|
| `simulator/output/orders.json` | Synthetic delivery orders |
| `simulator/output/raw_assets/` | Role-separated PersonalDataAssets |
| `ai-pricing/output/pricing_report.json` | Deterministic quality scores and prices |
| `ai-pricing/output/pricing_apply_receipt.json` | Sui pricing transaction summary |
| `walrus-uploader/output/upload_manifest.json` | Real Walrus blob IDs and AES metadata |
| `contracts/output/data_asset_registry.json` | Sui testnet DataAsset object IDs |
| `contracts/output/data_license_registry.json` | Sui testnet DataLicense object IDs |
| `seal-access/output/seal_key_registry.json` | Seal-encrypted AES key bundles |
| `seal-access/output/seal_access_receipt.json` | Real Seal access result |
| `seal-access/output/decrypted_dataset.json` | Licensed plaintext written locally for the buyer |
| `aggregator/output/demand_prediction_dataset.csv` | AI demand training data |
| `aggregator/output/dispatch_dataset.json` | Dispatch candidate states |
| `ai-agent/demand_prediction/output/demand_model.pkl` | Trained demand model |
| `ai-agent/demand_prediction/output/demo_grid_predictions.json` | Demand forecast output |
| `ai-agent/dispatch_optimization/output/sample_assignment.json` | Dispatch assignment output |

## Security Notes

Raw AES keys are never written to disk. They are generated in memory by the
Walrus uploader, wrapped with Seal, and later released only when Seal verifies a
real Sui testnet DataLicense through `data_license::seal_approve`.
