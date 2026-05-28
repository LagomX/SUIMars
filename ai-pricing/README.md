# Mars AI Pricing

`ai-pricing/` is the Mars protocol-side pricing agent. It is separate from
`ai-agent/`, which represents buyer-side model training and inference.

The v1 model is deterministic and rules-based:

- score each simulator-generated PersonalDataAsset
- write `ai-pricing/output/pricing_report.json`
- let `walrus-uploader price-assets` submit `set_quality_and_price` on Sui

Run:

```bash
python3 ai-pricing/price_report.py
pnpm --dir walrus-uploader price-assets
```

The report includes `quality_score`, `price_micro_usdc`, and the signals used to
derive them.
