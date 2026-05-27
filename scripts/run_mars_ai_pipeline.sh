#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "1. Generate personal raw DataAssets"
(cd simulator && npm run generate)

echo "2. Aggregate licensed buyer datasets"
python3 aggregator/main.py

echo "3. Train demand prediction model"
python3 ai-agent/demand_prediction/train_demand_model.py

echo "4. Predict future demand by grid"
python3 ai-agent/demand_prediction/predict_demand.py

echo "5. Run dispatch scoring demo"
python3 ai-agent/dispatch_optimization/assign_rider.py
