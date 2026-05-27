from __future__ import annotations

import csv
import json
import pickle
from pathlib import Path
from typing import Any


FEATURES = [
    "order_count_t0",
    "order_count_t_minus_1",
    "order_count_t_minus_2",
    "active_riders",
    "available_riders",
    "pending_orders",
    "avg_accept_delay_min",
    "avg_prep_time_min",
    "avg_delivery_duration_min",
    "merchant_count",
    "merchant_density",
    "traffic_level",
    "weather_code",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
]
TARGET = "future_30min_order_count"


def load_rows(path: Path = Path("aggregator/output/demand_prediction_dataset.csv")) -> list[dict[str, Any]]:
    with path.open() as file:
        return list(csv.DictReader(file))


def feature_matrix(rows: list[dict[str, Any]]) -> tuple[list[list[float]], list[float]]:
    x = []
    y = []
    for row in rows:
        x.append([parse_feature(row[name]) for name in FEATURES])
        y.append(float(row[TARGET]))
    return x, y


def parse_feature(value: Any) -> float:
    if value in (True, "True", "true"):
        return 1.0
    if value in (False, "False", "false"):
        return 0.0
    return float(value)


def train_model(x: list[list[float]], y: list[float]) -> tuple[Any, str]:
    try:
        from lightgbm import LGBMRegressor

        model = LGBMRegressor(n_estimators=120, learning_rate=0.06, random_state=42)
        model.fit(x, y)
        return model, "lightgbm"
    except Exception:
        try:
            from sklearn.ensemble import GradientBoostingRegressor

            model = GradientBoostingRegressor(n_estimators=120, learning_rate=0.06, random_state=42)
            model.fit(x, y)
            return model, "sklearn_gradient_boosting"
        except Exception as fallback_error:
            raise RuntimeError(
                "Demand model training requires either lightgbm or scikit-learn. "
                "Install with: pip3 install lightgbm scikit-learn"
            ) from fallback_error


def main() -> None:
    rows = load_rows()
    x, y = feature_matrix(rows)
    model, algorithm = train_model(x, y)
    output_dir = Path("ai-agent/demand_prediction/output")
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "demand_model.pkl"
    with model_path.open("wb") as file:
        pickle.dump({"algorithm": algorithm, "features": FEATURES, "model": model}, file)

    metrics = {
        "algorithm": algorithm,
        "training_rows": len(rows),
        "target_mean": round(sum(y) / max(1, len(y)), 3),
        "model_path": str(model_path),
    }
    (output_dir / "training_summary.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print("Demand model trained")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
