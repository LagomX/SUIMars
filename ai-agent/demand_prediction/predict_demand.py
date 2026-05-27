from __future__ import annotations

import csv
import json
import pickle
from collections import defaultdict
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
    model = model_bundle["model"]
    output = []
    for row in rows:
        prediction = float(model.predict([row_features(row)])[0])
        output.append(
            {
                "grid_id": row["grid_id"],
                "window_start": row["window_start"],
                "predicted_demand_next_30min": max(0, round(prediction, 2)),
            }
        )
    return output


def latest_future_demand_by_grid(
    dataset_path: Path = Path("aggregator/output/demand_prediction_dataset.csv"),
) -> list[dict[str, Any]]:
    with dataset_path.open() as file:
        rows = list(csv.DictReader(file))
    latest_window = max(row["window_start"] for row in rows)
    latest_rows = [row for row in rows if row["window_start"] == latest_window]
    predictions = predict_rows(latest_rows, load_model())
    return sorted(predictions, key=lambda item: item["predicted_demand_next_30min"], reverse=True)


def main() -> None:
    predictions = latest_future_demand_by_grid()
    output_dir = Path("ai-agent/demand_prediction/output")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "latest_grid_predictions.json"
    output_path.write_text(json.dumps(predictions, indent=2) + "\n")

    print("Future demand by grid")
    for item in predictions[:8]:
        print(f"{item['grid_id']}: {item['predicted_demand_next_30min']}")


if __name__ == "__main__":
    main()
