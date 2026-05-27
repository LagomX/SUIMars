#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Prefer the Python that has lightgbm/scikit-learn installed.
# /usr/bin/python3 (macOS system Python 3.9) has the ML packages.
# Brew Python 3.14 does not have them due to a pyexpat link error.
PYTHON="${MARS_PYTHON:-/usr/bin/python3}"

echo "Using Python: $PYTHON ($($PYTHON --version 2>&1))"
echo ""

echo "1. Generate Sui testnet-compatible simulator wallets"
pnpm simulator:wallets

echo "2. Generate personal raw DataAssets"
pnpm simulator:generate

echo "3. Aggregate licensed buyer datasets"
"$PYTHON" aggregator/main.py

echo "4. Train demand prediction model"
"$PYTHON" ai-agent/demand_prediction/train_demand_model.py

echo "5. Predict future demand by grid"
"$PYTHON" ai-agent/demand_prediction/predict_demand.py

echo "6. Run dispatch scoring demo"
"$PYTHON" ai-agent/dispatch_optimization/assign_rider.py
