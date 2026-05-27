# Dispatch Optimization

Dispatch Optimization uses the buyer-side dispatch dataset plus demand state from the aggregated grid-time data.

The MVP intentionally uses rule-based scoring, not reinforcement learning. Weights are configurable through the `DispatchWeights` dataclass in `dispatch_scoring.py`.

Scoring formula:

```text
dispatch_score =
w1 * distance_score
+ w2 * eta_score
+ w3 * rider_idle_score
+ w4 * fairness_score
+ w5 * demand_balance_score
```

## Run

```bash
python3 ai-agent/dispatch_optimization/assign_rider.py
```

Output:

- `ai-agent/dispatch_optimization/output/sample_assignment.json`
