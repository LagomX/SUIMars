from __future__ import annotations

import json
from pathlib import Path

from dispatch_scoring import DispatchWeights, rank_candidates


def assign_best_rider(
    dispatch_dataset_path: Path = Path("aggregator/output/dispatch_dataset.json"),
    weights: DispatchWeights = DispatchWeights(),
) -> dict:
    """Score and rank candidate riders for the first order in the dispatch dataset.

    This is a single-order demo: it processes dispatch_states[0] to show how the
    scoring formula works end-to-end.  A production dispatcher would iterate over
    all states and integrate with a live rider-location API.
    """
    dispatch_states = json.loads(dispatch_dataset_path.read_text())
    sample = dispatch_states[0]   # demo: evaluate one order only
    ranked = rank_candidates(sample, weights)
    return {
        "timestamp": sample["timestamp"],
        "order": sample["order"],
        "best_assignment": ranked[0],
        "ranked_candidates": ranked,
        "weights": weights.__dict__,
    }


def main() -> None:
    result = assign_best_rider()
    output_dir = Path("ai-agent/dispatch_optimization/output")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "sample_assignment.json"
    output_path.write_text(json.dumps(result, indent=2) + "\n")

    print("Best rider assignment")
    print(f"Order: {result['order']['order_id']}")
    print(f"Rider: {result['best_assignment']['rider_id']}")
    print(f"Score: {result['best_assignment']['dispatch_score']}")


if __name__ == "__main__":
    main()
