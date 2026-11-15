"""Shared code for the HemoScope training scripts.

Everything here has a TypeScript twin in lib/ml.ts. If you change one, change the other and rerun
`python scripts/make_parity_cases.py` so the app tests still prove both give the same numbers.
"""
import math

import numpy as np
import pandas as pd
from scipy.stats import chi2

# Within-person variation (SD of the natural log), short term. Same values as lib/config.ts.
SD_SHORT = {"wbc": 0.129, "neu": 0.194, "lym": 0.147, "mon": 0.233, "eos": 0.261}
FORECAST_MARKERS = ["wbc", "neu", "lym", "mon", "eos"]
SCORE_MARKERS = ["neu", "lym", "mon", "eos"]  # markers in the Immune Deviation Score
UNUSUAL = 95.0  # score at or above this is Unusual
Q_UNUSUAL = float(chi2.ppf(UNUSUAL / 100, len(SCORE_MARKERS)))  # sum of squared z that gives a score of 95
BASELINE_SAMPLES = 2  # first samples of each series act as the personal baseline (like preflight checks)


def load_cbc(path):
    """Blood counts with the two known entry errors removed, one sample per series per day.
    A series is one person in one study (the same people appear in SDY296 and SDY301, a year apart)."""
    d = pd.read_csv(path)
    d = d[d[["neu", "lym", "mon", "eos", "bas"]].sum(axis=1) / d.wbc <= 1.15]
    d["series"] = d.study + ":" + d.subject
    d = d.sort_values(["series", "day"]).groupby(["series", "day"], as_index=False).first()
    return d


def deviation_score(values, base_logs, n_base):
    """Immune Deviation Score (0 to 100) and the z-scores, as in lib/engine.ts (no spaceflight adjustment)."""
    z = [(math.log(max(values[m], 0.01)) - base_logs[m]) / (SD_SHORT[m] * math.sqrt(1 + 1 / n_base)) for m in SCORE_MARKERS]
    q = sum(v * v for v in z)
    return 100 * float(chi2.cdf(q, len(SCORE_MARKERS))), z


# ---------------------------------------------------------------- Kalman filter forecast
def kalman_steps(days, logs, r, q, start=BASELINE_SAMPLES):
    """Local level model in log space. Yields (index, forecast mean, forecast SD incl. measurement noise)
    for every sample after the baseline, using only earlier samples."""
    if len(logs) <= start:
        return
    level = float(np.mean(logs[:start]))
    var = r * r / start
    last = days[start - 1]
    for i in range(start, len(logs)):
        gap = max(days[i] - last, 0.1)
        var_pred = var + q * gap / 30.0
        yield i, level, math.sqrt(var_pred + r * r)
        k = var_pred / (var_pred + r * r)
        level = level + k * (logs[i] - level)
        var = (1 - k) * var_pred
        last = days[i]


def series_arrays(frame, marker):
    for _, g in frame.groupby("series"):
        yield g.day.values, np.log(g[marker].clip(lower=0.01).values)


def log_likelihood(frame, marker, r, q):
    ll = 0.0
    for days, logs in series_arrays(frame, marker):
        for i, mu, sd in kalman_steps(days, logs, r, q):
            ll += -math.log(sd) - 0.5 * ((logs[i] - mu) / sd) ** 2
    return ll


def fit_kalman(frame, marker):
    """Learns drift q (per 30 days) and measurement SD r by maximum likelihood on a grid."""
    best = (-1e18, None, None)
    for f in np.linspace(0.7, 1.5, 17):
        r = SD_SHORT[marker] * f
        for q in np.concatenate([[0.0], np.geomspace(1e-4, 0.5, 40)]):
            ll = log_likelihood(frame, marker, r, q)
            if ll > best[0]:
                best = (ll, float(r), float(q))
    return {"r": best[1], "q": best[2]}


# ---------------------------------------------------------------- seeded random numbers (mirrored in TypeScript)
def mulberry32(seed):
    """Same generator as lib/data.ts and lib/ml.ts, so Python and the app draw identical numbers."""
    state = seed & 0xFFFFFFFF

    def nxt():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def normal_draws(n, dims, seed):
    """n x dims standard normal draws (Box-Muller) from mulberry32."""
    rnd = mulberry32(seed)
    out = np.empty((n, dims))
    for i in range(n):
        for j in range(dims):
            u1 = max(rnd(), 1e-12)
            u2 = rnd()
            out[i, j] = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
    return out


def raw_risk(mu_z, sd_z, draws):
    """Share of simulated next checks whose Immune Deviation Score is 95 or higher.
    mu_z, sd_z: forecast mean and SD of each score marker's z-score."""
    z = np.asarray(mu_z) + draws * np.asarray(sd_z)
    return float(np.mean((z * z).sum(axis=1) >= Q_UNUSUAL))


def calibrate(p, a, b):
    """Logistic recalibration learned on training people."""
    p = min(max(p, 1e-4), 1 - 1e-4)
    return 1 / (1 + math.exp(-(a + b * math.log(p / (1 - p)))))
