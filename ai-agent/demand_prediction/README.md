# Demand Prediction

This module trains an offline model on the buyer-side aggregated grid-time dataset.

It uses `LightGBMRegressor` when `lightgbm` is installed. If not, it falls back to `sklearn.ensemble.GradientBoostingRegressor`. If neither dependency exists, training fails with an explicit setup error.

## Run

```bash
pip3 install lightgbm scikit-learn
python3 ai-agent/demand_prediction/train_demand_model.py
python3 ai-agent/demand_prediction/predict_demand.py
```

Input:

- `aggregator/output/demand_prediction_dataset.csv`

Outputs:

- `ai-agent/demand_prediction/output/demand_model.pkl`
- `ai-agent/demand_prediction/output/latest_grid_predictions.json`
