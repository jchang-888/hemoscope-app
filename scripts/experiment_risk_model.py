"""Model 2: immune risk forecast, the chance that the NEXT Blood Check scores Unusual (95 or higher).

How it works:
1. The Kalman forecast (model 1) gives each marker's next value as a mean and an SD.
2. 2,000 possible next checks are simulated from those forecasts (seeded, so the app gets identical numbers).
3. Each simulated check gets an Immune Deviation Score; the share at 95 or higher is the raw risk.
4. A logistic recalibration learned on training people turns the raw risk into a calibrated probability.
Tested on people the model never saw: AUC, Brier score and a calibration table.

Usage: python scripts/experiment_risk_model.py data/processed/cbc.csv docs/experiments/risk-model-results.json

EXPERIMENT ONLY: this model was tested and NOT used in the app (see docs/MACHINE_LEARNING.md).
"""
import json
import math
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

from hemoscope_ml import (BASELINE_SAMPLES, SCORE_MARKERS, SD_SHORT, calibrate, deviation_score, fit_kalman,
                          kalman_steps, load_cbc, normal_draws, raw_risk)

CBC, OUT = sys.argv[1], sys.argv[2]
N_DRAWS, SEED = 2000, 20261109
DRAWS = normal_draws(N_DRAWS, len(SCORE_MARKERS), SEED)

d = load_cbc(CBC)
people = d.subject.unique()
tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.3, random_state=11).split(people, groups=people))
train, test = d[d.subject.isin(people[tr])], d[d.subject.isin(people[te])]


def predictions(frame, params):
    """One row per forecast: raw risk and whether the real next check scored Unusual."""
    rows = []
    for series, g in frame.groupby("series"):
        g = g.reset_index(drop=True)
        if len(g) <= BASELINE_SAMPLES:
            continue
        base = {m: float(np.log(g[m].iloc[:BASELINE_SAMPLES].clip(lower=0.01)).mean()) for m in SCORE_MARKERS}
        scale = {m: SD_SHORT[m] * math.sqrt(1 + 1 / BASELINE_SAMPLES) for m in SCORE_MARKERS}
        steps = {m: {i: (mu, sd) for i, mu, sd in kalman_steps(g.day.values, np.log(g[m].clip(lower=0.01).values),
                                                                params[m]["r"], params[m]["q"])} for m in SCORE_MARKERS}
        for i in range(BASELINE_SAMPLES, len(g)):
            mu_z = [(steps[m][i][0] - base[m]) / scale[m] for m in SCORE_MARKERS]
            sd_z = [steps[m][i][1] / scale[m] for m in SCORE_MARKERS]
            score, _ = deviation_score(g.iloc[i], base, BASELINE_SAMPLES)
            rows.append({"series": series, "day": float(g.day.iloc[i]), "raw": raw_risk(mu_z, sd_z, DRAWS), "unusual": score >= 95})
    return rows


def fit_calibration(rows):
    x = np.array([[math.log(min(max(r["raw"], 1e-4), 1 - 1e-4) / (1 - min(max(r["raw"], 1e-4), 1 - 1e-4)))] for r in rows])
    y = np.array([r["unusual"] for r in rows]).astype(int)
    lr = LogisticRegression(C=1e6).fit(x, y)
    return float(lr.intercept_[0]), float(lr.coef_[0][0])


def evaluate(rows, a, b, label):
    y = np.array([r["unusual"] for r in rows]).astype(int)
    raw = np.array([r["raw"] for r in rows])
    p = np.array([calibrate(v, a, b) for v in raw])
    base_rate = y.mean()
    res = {
        "forecasts": int(len(y)), "unusualRate": float(base_rate),
        "auc": float(roc_auc_score(y, p)), "aucRaw": float(roc_auc_score(y, raw)),
        "brier": float(brier_score_loss(y, p)), "brierRaw": float(brier_score_loss(y, raw)),
        "brierAlwaysBaseRate": float(brier_score_loss(y, np.full(len(y), base_rate))),
        "meanPredicted": float(p.mean()),
    }
    res["brierSkill"] = 1 - res["brier"] / res["brierAlwaysBaseRate"]
    bins = [0, 0.1, 0.2, 0.3, 0.5, 1.0001]
    res["calibration"] = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        k = (p >= lo) & (p < hi)
        if k.sum():
            res["calibration"].append({"from": lo, "to": min(hi, 1.0), "forecasts": int(k.sum()),
                                       "meanPredicted": float(p[k].mean()), "observed": float(y[k].mean())})
    # how well the top risk group is separated
    top = p >= 0.3
    res["highRiskGroup"] = {"threshold": 0.3, "share": float(top.mean()), "observed": float(y[top].mean()) if top.any() else None,
                            "observedOthers": float(y[~top].mean())}
    print(f"\n{label}: forecasts {res['forecasts']}, unusual rate {base_rate:.3f}, AUC {res['auc']:.3f} (raw {res['aucRaw']:.3f}), "
          f"Brier {res['brier']:.4f} vs always-base-rate {res['brierAlwaysBaseRate']:.4f} (skill {res['brierSkill']:.3f}), raw Brier {res['brierRaw']:.4f}")
    for c in res["calibration"]:
        print(f"  predicted {c['from']:.1f}-{c['to']:.1f}: n {c['forecasts']:4d}, mean predicted {c['meanPredicted']:.3f}, observed {c['observed']:.3f}")
    print("  high risk group (>= 30%):", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in res["highRiskGroup"].items()})
    return res


params_train = {m: fit_kalman(train, m) for m in SCORE_MARKERS}
train_rows = predictions(train, params_train)
a, b = fit_calibration(train_rows)
print("calibration a, b:", round(a, 4), round(b, 4))
evaluate(train_rows, a, b, "training people")
test_res = evaluate(predictions(test, params_train), a, b, "TEST people (never seen)")

# final model: forecast parameters and calibration learned from everyone
params_all = {m: fit_kalman(d, m) for m in SCORE_MARKERS}
fa, fb = fit_calibration(predictions(d, params_all))
with open(OUT, "w") as fh:
    json.dump({
        "name": "HemoScope immune risk forecast",
        "type": "monte_carlo_deviation_score_with_logistic_calibration",
        "draws": N_DRAWS, "seed": SEED, "unusualScore": 95,
        "calibration": {"a": round(fa, 6), "b": round(fb, 6)},
        "metrics": {"trainedOn": "ImmPort SDY180, SDY296, SDY301, SDY1252",
                    "trainPeople": int(len(tr)), "testPeople": int(len(te)),
                    **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in test_res.items()}},
    }, fh, indent=1)
print("saved", OUT, "final calibration", round(fa, 4), round(fb, 4))
