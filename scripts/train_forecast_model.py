"""Model 1: next blood check forecast (Kalman filter, local level model in log space).

For each marker the hidden state is the person's true level. Each new sample updates it; between samples the
level can drift. Drift (q) and measurement noise (r) are learned by maximum likelihood on training people, then
tested on people the model never saw.

Usage: python scripts/train_forecast_model.py data/processed/cbc.csv lib/models/forecast-model.json
"""
import json
import sys

import numpy as np
from sklearn.model_selection import GroupShuffleSplit

from hemoscope_ml import BASELINE_SAMPLES, FORECAST_MARKERS, fit_kalman, kalman_steps, load_cbc, series_arrays
from mlflow_log import log_run

CBC, OUT = sys.argv[1], sys.argv[2]
Z95 = 1.96
d = load_cbc(CBC)

people = d.subject.unique()
tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.3, random_state=11).split(people, groups=people))
train, test = d[d.subject.isin(people[tr])], d[d.subject.isin(people[te])]

results = {}
for m in FORECAST_MARKERS:
    p = fit_kalman(train, m)
    inside, err, naive = [], [], []
    for days, logs in series_arrays(test, m):
        for i, mu, sd in kalman_steps(days, logs, p["r"], p["q"]):
            inside.append(abs(logs[i] - mu) <= Z95 * sd)
            err.append(abs(np.exp(logs[i] - mu) - 1))
            naive.append(abs(np.exp(logs[i] - logs[i - 1]) - 1))
    results[m] = {
        "forecasts": len(inside), "coverage95": float(np.mean(inside)),
        "medianError": float(np.median(err)), "naiveMedianError": float(np.median(naive)),
        "within25pct": float(np.mean(np.array(err) <= 0.25)), "naiveWithin25pct": float(np.mean(np.array(naive) <= 0.25)),
        "r": p["r"], "q": p["q"],
    }
    r = results[m]
    print(f"{m}: forecasts {r['forecasts']}, coverage {r['coverage95']:.3f}, median error {r['medianError']:.3f} "
          f"(repeat last value {r['naiveMedianError']:.3f}), within 25% {r['within25pct']:.3f} (repeat last {r['naiveWithin25pct']:.3f})")

n = sum(r["forecasts"] for r in results.values())
wavg = lambda k: sum(r[k] * r["forecasts"] for r in results.values()) / n
summary = {k: round(wavg(k), 4) for k in ["coverage95", "within25pct", "naiveWithin25pct", "medianError", "naiveMedianError"]}
print(f"train people {len(tr)}, test people {len(te)}, forecasts {n}, {summary}")

final = {m: fit_kalman(d, m) for m in FORECAST_MARKERS}  # final parameters learned from everyone
with open(OUT, "w") as fh:
    json.dump({
        "name": "HemoScope next blood check forecast",
        "type": "kalman_local_level_log",
        "driftVariancePer30Days": {m: round(final[m]["q"], 6) for m in FORECAST_MARKERS},
        "measurementSd": {m: round(final[m]["r"], 4) for m in FORECAST_MARKERS},
        "z": Z95, "baselineSamples": BASELINE_SAMPLES,
        "metrics": {
            "trainedOn": "ImmPort SDY180, SDY296, SDY301, SDY1252",
            "series": int(d.series.nunique()), "people": int(d.subject.nunique()), "samples": int(len(d)),
            "trainPeople": int(len(tr)), "testPeople": int(len(te)), "forecasts": int(n), **summary,
            "perMarker": {m: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()} for m, r in results.items()},
        },
    }, fh, indent=1)
print("saved", OUT)

# Optional: record the held-out results and the model file in MLflow (does nothing if mlflow is not installed).
log_run("train_forecast_model",
        {**{f"forecast_{m}_coverage95": r["coverage95"] for m, r in results.items()},
         **{f"forecast_{m}_median_error": r["medianError"] for m, r in results.items()}},
        [OUT])
