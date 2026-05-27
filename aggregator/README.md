# Mars Aggregator

The aggregator represents the buyer-side licensed data pipeline.

It does not treat Mars as the owner of raw plaintext data. The simulator writes user-owned encrypted DataAssets and a mock license manifest. After a buyer has licensed access, this module copies the encrypted mock Walrus blobs, decrypts them with local MVP keys, merges role-specific events by `order_id`, and exports AI-ready datasets.

## Run

```bash
python3 aggregator/main.py
```

Outputs:

- `aggregator/output/demand_prediction_dataset.csv`
- `aggregator/output/demand_prediction_dataset.json`
- `aggregator/output/dispatch_dataset.json`
- `aggregator/output/buyer_dataset/manifest.json`

## Pipeline

1. `fetch_assets.py` loads `simulator/output/license_manifest.json`.
2. `decrypt_assets.py` decodes mock encrypted DataAssets.
3. `merge_events.py` joins rider, merchant, and consumer events by `order_id`.
4. `build_grid_time_dataset.py` creates 15-minute grid-time forecasting rows.
5. `build_dispatch_dataset.py` creates real-time order and candidate rider states.
6. `export_buyer_dataset.py` writes clean buyer-facing JSON and CSV files.
