# Simulator Wallets

This folder generates Sui testnet-compatible Ed25519 wallets for Mars simulator users.

The simulator does not integrate zkLogin. zkLogin is the production onboarding layer. For the hackathon/testnet MVP, generated Ed25519 keypairs are used directly so DataAssets can be bound to real Sui-style owner/contributor addresses.

## Security Warning

Generated private keys are for local testnet and hackathon demos only.

Never use these generated keys for mainnet funds. Never commit generated private key JSON files. The generated files under `simulator/users/*.json` are ignored by git.

## Generate Users

From the repo root:

```bash
pnpm simulator:wallets
```

From the simulator package:

```bash
pnpm wallets
```

Default output:

- `simulator/users/riders.json`
- `simulator/users/merchants.json`
- `simulator/users/consumers.json`
- `simulator/users/all_users.json`

Default counts:

- 100 riders
- 40 merchants
- 500 consumers

Override counts with environment variables:

```bash
MARS_RIDER_COUNT=10 MARS_MERCHANT_COUNT=5 MARS_CONSUMER_COUNT=20 pnpm simulator:wallets
```

## Optional Faucet

Funding is disabled by default.

```bash
FUND_TESTNET_WALLETS=true FAUCET_LIMIT=10 pnpm simulator:faucet
```

If the Sui faucet SDK helper changes, the script fails gracefully and prints a TODO.
