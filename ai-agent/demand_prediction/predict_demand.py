from __future__ import annotations

import csv
import json
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any

from train_demand_model import FEATURES


def load_model(path: Path = Path("ai-agent/demand_prediction/output/demand_model.pkl")) -> dict[str, Any]:
    with path.open("rb") as file:
        return pickle.load(file)


def row_features(row: dict[str, str]) -> list[float]:
    parsed = []
    for name in FEATURES:
        value = row[name]
        if value in ("True", "true"):
            parsed.append(1.0)
        elif value in ("False", "false"):
            parsed.append(0.0)
        else:
            parsed.append(float(value))
    return parsed


def predict_rows(rows: list[dict[str, str]], model_bundle: dict[str, Any]) -> list[dict[str, Any]]:
    import pandas as pd

    model = model_bundle["model"]
    features = model_bundle["features"]
    # Use a DataFrame with named columns matching the training feature names so
    # sklearn's validation layer suppresses the "no feature names" warning.
    X = pd.DataFrame([row_features(row) for row in rows], columns=features)
    preds = model.predict(X)
    return [
        {
            "grid_id": row["grid_id"],
            "window_start": row["window_start"],
            "predicted_demand_next_30min": max(0.0, round(float(pred), 2)),
        }
        for row, pred in zip(rows, preds)
    ]


def parse_window(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def select_demo_window(rows: list[dict[str, str]]) -> str:
    """Pick a realistic complete peak window instead of the dataset boundary."""
    windows = sorted({row["window_start"] for row in rows}, reverse=True)
    for preferred_hour in (19, 12):
        for window in windows:
            dt = parse_window(window)
            if dt.weekday() < 5 and dt.hour == preferred_hour and dt.minute == 0:
                window_rows = [row for row in rows if row["window_start"] == window]
                future_total = sum(float(row["future_30min_order_count"]) for row in window_rows)
                if len(window_rows) >= 16 and future_total > 0:
                    return window

    for window in windows:
        window_rows = [row for row in rows if row["window_start"] == window]
        if sum(float(row["future_30min_order_count"]) for row in window_rows) > 0:
            return window

    raise ValueError("No complete demand prediction window with a non-zero future target was found.")


def demo_future_demand_by_grid(
    dataset_path: Path = Path("aggregator/output/demand_prediction_dataset.csv"),
) -> list[dict[str, Any]]:
    with dataset_path.open() as file:
        rows = list(csv.DictReader(file))
    demo_window = select_demo_window(rows)
    demo_rows = [row for row in rows if row["window_start"] == demo_window]
    predictions = predict_rows(demo_rows, load_model())
    return sorted(predictions, key=lambda item: item["predicted_demand_next_30min"], reverse=True)


def main() -> None:
    predictions = demo_future_demand_by_grid()
    output_dir = Path("ai-agent/demand_prediction/output")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "demo_grid_predictions.json"
    output_path.write_text(json.dumps(predictions, indent=2) + "\n")

    window_start = predictions[0]["window_start"] if predictions else "unknown"
    print(f"Future demand by grid for demo window {window_start}")
    for item in predictions[:8]:
        print(f"{item['grid_id']}: {item['predicted_demand_next_30min']}")


if __name__ == "__main__":
    main()
