#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf \
  simulator/output \
  ai-pricing/output \
  walrus-uploader/output \
  contracts/output \
  seal-access/output \
  aggregator/output \
  ai-agent/demand_prediction/output \
  ai-agent/dispatch_optimization/output

mkdir -p \
  simulator/output \
  ai-pricing/output \
  walrus-uploader/output \
  contracts/output \
  seal-access/output \
  aggregator/output \
  ai-agent/demand_prediction/output \
  ai-agent/dispatch_optimization/output

echo "Cleaned generated Mars outputs."
