# Mars Simulator

The simulator generates personal raw delivery DataAssets. It does not generate the centralized AI training dataset directly.

Generated asset types:

- `rider_mobility`
- `merchant_operations`
- `consumer_demand`

Each asset is owned by one contributor and is written as plaintext under `simulator/output/raw_assets/` for local inspection. The simulator also writes mock encrypted envelopes under `simulator/output/mock_walrus/` so the aggregator can mimic licensed buyer access.

## Run

```bash
npm install
npm run generate
```

Important outputs:

- `simulator/output/raw_assets/`
- `simulator/output/mock_walrus/encrypted_assets/`
- `simulator/output/license_manifest.json`
- `simulator/output/simulation_summary.json`

The default run covers 7 days, 16 grids, and 15-minute windows. The aggregator should produce about 10,752 grid-time rows from this data.
