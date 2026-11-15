"""Writes lib/models/parity-cases.json: map inputs and the outputs Python computes for them.
lib/ml.test.ts checks that the app's TypeScript gives the same answers.

Usage: python scripts/make_parity_cases.py lib/models/state-map.json lib/models/parity-cases.json
"""
import json
import math
import sys

import numpy as np

MODEL, OUT = sys.argv[1], sys.argv[2]
sm = json.load(open(MODEL))


def log_density(x, y):
    tot = 0.0
    for w, mu, c in zip(sm["mixture"]["weights"], sm["mixture"]["means"], sm["mixture"]["covariances"]):
        c = np.array(c)
        diff = np.array([x, y]) - np.array(mu)
        tot += w * math.exp(-0.5 * diff @ np.linalg.inv(c) @ diff) / (2 * math.pi * math.sqrt(np.linalg.det(c)))
    return math.log(max(tot, 1e-300))


def point(z):
    c = np.array(z) / np.array(sm["zSpread"]) - np.array(sm["pcaMean"])
    x, y = float(np.array(sm["axes"][0]) @ c), float(np.array(sm["axes"][1]) @ c)
    ld = log_density(x, y)
    zl = sm["zoneLogDensity"]
    zone = "Very Common" if ld >= zl["0.5"] else "Common" if ld >= zl["0.9"] else "Uncommon" if ld >= zl["0.99"] else "Rare"
    qs = sm["trainLogDensityQuantiles"]
    below = 0
    while below < len(qs) - 1 and qs[below + 1] <= ld:
        below += 1
    return {"x": x, "y": y, "logDensity": ld, "zone": zone, "typicality": 0 if ld < qs[0] else below}


cases = [
    ("at expected values", [0, 0, 0, 0]),
    ("small normal variation", [0.6, -0.4, 0.3, -0.2]),
    ("neutrophils far above expected", [4.5, 0, 0.8, 0]),
    ("lymphocytes far below expected", [0, -3.5, 0, -0.5]),
    ("everything high", [2.5, 2.5, 2.5, 2.5]),
    ("eosinophils high", [0, 0.5, 0, 3.0]),
]
out = [{"name": n, "z": z, **point(z)} for n, z in cases]
for c in out:
    print(f"{c['name']:34s} x {c['x']:6.2f} y {c['y']:6.2f} {c['zone']:12s} typicality {c['typicality']}")
json.dump({"stateMap": out}, open(OUT, "w"), indent=1)
