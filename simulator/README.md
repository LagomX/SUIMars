# Mars Simulator

The simulator generates personal raw delivery DataAssets. It does not generate the centralized AI training dataset directly.

For the hackathon/testnet MVP, simulator users are generated as real Sui testnet-compatible Ed25519 keypairs. zkLogin is production onboarding and is intentionally not integrated in the simulator.

Generated asset types:

- `rider_mobility`
- `merchant_operations`
- `consumer_behavior`

Each asset is owned by one contributor Sui address and is written as plaintext under `simulator/output/raw_assets/`. Downstream encryption and storage are handled only by the Walrus uploader against real testnet infrastructure.

## Security Warning

Generated private keys are for Sui testnet and hackathon demos only. Never use these generated keys for mainnet funds. Generated user files under `simulator/users/*.json` are ignored by git.

## Run

```bash
pnpm install
pnpm wallets
pnpm generate
```

From the repo root:

```bash
pnpm simulator:wallets
pnpm simulator:generate
```

Important outputs:

- `simulator/users/riders.json`
- `simulator/users/merchants.json`
- `simulator/users/consumers.json`
- `simulator/users/all_users.json`
- `simulator/output/orders.json`
- `simulator/output/raw_assets/`
- `simulator/output/simulation_summary.json`

The default run generates 100 riders, 40 merchants, 500 consumers, 7 days, 16 grids, and 15-minute windows. The aggregator should produce about 10,752 grid-time rows from this data.

Raw DataAssets include:

- `owner`: the generated Sui address;
- `contributors`: Sui contributor addresses and basis-point weights;
- role-specific raw events.
