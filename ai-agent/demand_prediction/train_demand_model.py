from __future__ import annotations

import json
import math
import pickle
import warnings
from csv import DictReader
from pathlib import Path
from typing import Any

# LightGBM's internal early-stopping callbacks call sklearn predict() with a
# numpy array rather than a named DataFrame, triggering this sklearn UserWarning.
# The warning is harmless — feature alignment is guaranteed by DataFrame input at
# fit() time.  Suppress it globally to keep pipeline output clean.
warnings.filterwarnings(
    "ignore",
    message="X does not have valid feature names",
    category=UserWarning,
)

# ── Feature configuration ──────────────────────────────────────────────────────

FEATURES = [
    # Spatial identity — declared as categorical so LightGBM learns per-grid patterns
    "grid_index",           # 0–15 integer encoding of grid_id
    # Lagged demand (supply-side history)
    "order_count_t0",
    "order_count_t_minus_1",
    "order_count_t_minus_2",
    # Supply state
    "active_riders",
    "available_riders",
    "pending_orders",
    # Operational latencies
    "avg_accept_delay_min",
    "avg_prep_time_min",
    "avg_delivery_duration_min",
    # Merchant density
    "merchant_count",
    "merchant_density",
    # Context signals
    "traffic_level",
    "weather_code",         # declared as categorical (0 = clear, 1 = rain)
    "hour_of_day",          # 0–23 — declared as categorical
    "day_of_week",          # 0–6  — declared as categorical; captures weekly seasonality
    # NOTE: is_weekend intentionally excluded — fully derivable from day_of_week >= 5
    #       and therefore redundant for the model.
]

TARGET = "future_30min_order_count"

# Columns that LightGBM should treat as categorical (not continuous numeric).
# LightGBM uses Fisher (1958) optimal split for categoricals, which outperforms
# treating these as ordered integers (e.g. day 0 and day 6 are NOT "6 apart").
CATEGORICAL_COLS = ["grid_index", "weather_code", "hour_of_day", "day_of_week"]


# ── Data loading ───────────────────────────────────────────────────────────────

def load_rows(path: Path = Path("aggregator/output/demand_prediction_dataset.csv")) -> list[dict[str, Any]]:
    with path.open() as f:
        return list(DictReader(f))


def parse_feature(value: Any) -> float:
    """Convert CSV string values to float. Handles boolean strings."""
    if value in (True, "True", "true"):
        return 1.0
    if value in (False, "False", "false"):
        return 0.0
    return float(value)


def feature_matrix(rows: list[dict[str, Any]]) -> tuple[list[list[float]], list[float]]:
    x = [[parse_feature(row[name]) for name in FEATURES] for row in rows]
    y = [float(row[TARGET]) for row in rows]
    return x, y


# ── Training ───────────────────────────────────────────────────────────────────

def train_model(
    x_train: list[list[float]],
    y_train: list[float],
    x_val: list[list[float]],
    y_val: list[float],
) -> tuple[Any, str]:
    """Train with LightGBM (preferred) or sklearn HistGradientBoosting (fallback).

    Both use Poisson loss, which is correct for non-negative count targets and
    prevents the model from predicting negative order counts.
    Categorical features are declared so the algorithm applies Fisher-optimal
    splits rather than treating categories as ordered continuous values.
    """
    import numpy as np      # available via lightgbm/scikit-learn dependency
    import pandas as pd     # available on all supported Python 3.9+ environments

    cat_indices = [FEATURES.index(col) for col in CATEGORICAL_COLS]
    # Use DataFrames with explicit column names so sklearn's validation layer
    # matches training and eval feature names and suppresses the feature-name warning.
    X_train = pd.DataFrame(x_train, columns=FEATURES)
    X_val   = pd.DataFrame(x_val,   columns=FEATURES)

    # ── LightGBM path ─────────────────────────────────────────────────────────
    try:
        from lightgbm import LGBMRegressor, early_stopping, log_evaluation

        model = LGBMRegressor(
            n_estimators=500,       # upper bound; early stopping will find the optimum
            learning_rate=0.06,
            num_leaves=31,          # default; good bias-variance balance for this dataset size
            min_child_samples=20,   # prevents overfitting on sparse grid-hour cells
            objective="poisson",    # correct loss for count data; guarantees non-negative preds
            random_state=42,
            n_jobs=-1,
            verbose=-1,
        )
        # LightGBM's internal early-stopping evaluation calls sklearn's predict
        # path without feature names, triggering a harmless sklearn UserWarning.
        # Suppress it here since feature alignment is guaranteed by DataFrame input.
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            model.fit(
                X_train,
                y_train,
                eval_set=[(X_val, y_val)],
                categorical_feature=CATEGORICAL_COLS,
                callbacks=[
                    early_stopping(50, verbose=False),  # stop if val loss stagnates for 50 rounds
                    log_evaluation(0),                  # suppress per-round output
                ],
            )
        return model, "lightgbm"

    except ImportError:
        pass  # LightGBM not installed — fall through to sklearn

    # ── sklearn HistGradientBoosting fallback ─────────────────────────────────
    # Requires scikit-learn >= 1.0 for Poisson loss and categorical_features.
    try:
        from sklearn.ensemble import HistGradientBoostingRegressor

        model = HistGradientBoostingRegressor(
            loss="poisson",             # same Poisson objective
            max_iter=500,
            learning_rate=0.06,
            max_leaf_nodes=31,
            min_samples_leaf=20,
            random_state=42,
            categorical_features=cat_indices,
            early_stopping=True,        # built-in early stopping
            validation_fraction=0.15,
            n_iter_no_change=50,
        )
        # HistGBR accepts DataFrame directly; column names are ignored internally
        model.fit(X_train, y_train)
        return model, "sklearn_hist_gradient_boosting"

    except ImportError as err:
        raise RuntimeError(
            "Demand model training requires lightgbm or scikit-learn>=1.0. "
            "Install with: pip3 install lightgbm scikit-learn"
        ) from err


# ── Evaluation ─────────────────────────────────────────────────────────────────

def rmse(model: Any, X: Any, y: list[float]) -> float:
    preds = model.predict(X)
    mse = sum((max(0.0, float(p)) - float(yv)) ** 2 for p, yv in zip(preds, y))
    return round(math.sqrt(mse / max(1, len(y))), 4)


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    rows = load_rows()

    # Temporal split: train on the first 85% of time, validate on the last 15%.
    # Random splits would leak future information into training — incorrect for
    # time-series demand forecasting.
    rows_sorted = sorted(rows, key=lambda r: r["window_start"])
    split = int(len(rows_sorted) * 0.85)
    train_rows, val_rows = rows_sorted[:split], rows_sorted[split:]

    x_train, y_train = feature_matrix(train_rows)
    x_val, y_val = feature_matrix(val_rows)

    model, algorithm = train_model(x_train, y_train, x_val, y_val)

    output_dir = Path("ai-agent/demand_prediction/output")
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "demand_model.pkl"
    with model_path.open("wb") as f:
        pickle.dump({"algorithm": algorithm, "features": FEATURES, "model": model}, f)

    metrics = {
        "algorithm": algorithm,
        "training_rows": len(train_rows),
        "validation_rows": len(val_rows),
        "target_mean_train": round(sum(y_train) / max(1, len(y_train)), 3),
        "validation_rmse": rmse(model, x_val, y_val),
        "model_path": str(model_path),
    }
    (output_dir / "training_summary.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print("Demand model trained")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
