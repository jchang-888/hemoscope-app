"""Model 3: Immune State Map.

Each blood check becomes a point on a 2D map of how far it is from the person's own baseline.
1. Input: the four z-scores used by the Immune Deviation Score (neutrophils, lymphocytes, monocytes, eosinophils),
   each measured against the person's own baseline (first two samples).
2. Each z-score is divided by its real spread in healthy repeat checks, then PCA (unsupervised) learns the two
   directions in which blood counts vary most. These are the map axes: overall immune cell level, and the
   neutrophil-lymphocyte balance.
3. A Gaussian mixture model learns the shape of the normal zone on the map. Contours mark where 50%, 90% and 99%
   of training people's checks fall.
4. Tested on people the model never saw: does the 90% zone really contain about 90% of their checks?
Real-world checks: the day after vaccination (immune activation) vs saline placebo, and the Inspiration4 crew at landing.

Usage: python scripts/train_state_map.py data/processed/cbc.csv data/raw/OSD-569_Complete_Blood_Count.csv lib/models/state-map.json
"""
import json
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.decomposition import PCA  # noqa: E402
from sklearn.mixture import GaussianMixture  # noqa: E402
from sklearn.model_selection import GroupShuffleSplit  # noqa: E402

from hemoscope_ml import BASELINE_SAMPLES, SCORE_MARKERS, SD_SHORT, load_cbc  # noqa: E402
from mlflow_log import log_run  # noqa: E402

CBC, OSD569, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
LEVELS = [0.5, 0.9, 0.99]
SCALE = {m: SD_SHORT[m] * math.sqrt(1 + 1 / BASELINE_SAMPLES) for m in SCORE_MARKERS}


def z_points(frame):
    rows = []
    for series, g in frame.groupby("series"):
        g = g.reset_index(drop=True)
        if len(g) <= BASELINE_SAMPLES:
            continue
        base = {m: float(np.log(g[m].iloc[:BASELINE_SAMPLES].clip(lower=0.01)).mean()) for m in SCORE_MARKERS}
        for i in range(BASELINE_SAMPLES, len(g)):
            z = {m: (math.log(max(g[m].iloc[i], 0.01)) - base[m]) / SCALE[m] for m in SCORE_MARKERS}
            rows.append({"series": series, "subject": g.subject.iloc[i], "arm": str(g.arm.iloc[i]), "day": float(g.day.iloc[i]), **z})
    return pd.DataFrame(rows)


d = load_cbc(CBC)
pts = z_points(d)
people = pts.subject.unique()
tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.3, random_state=11).split(people, groups=people))
train, test = pts[pts.subject.isin(people[tr])], pts[pts.subject.isin(people[te])]


def fit(frame):
    sd = frame[SCORE_MARKERS].values.std(axis=0)
    Z = frame[SCORE_MARKERS].values / sd
    pca = PCA(2).fit(Z)
    xy = pca.transform(Z)
    best = None
    for k in range(1, 6):
        g = GaussianMixture(k, covariance_type="full", random_state=0, n_init=5).fit(xy)
        if best is None or g.bic(xy) < best[0]:
            best = (g.bic(xy), g)
    gmm = best[1]
    dens = gmm.score_samples(xy)
    cut = {lv: float(np.quantile(dens, 1 - lv)) for lv in LEVELS}  # log density at the edge of each zone
    return pca, gmm, cut, sd


def inside(gmm, cut, xy, level):
    return gmm.score_samples(xy) >= cut[level]


pca, gmm, cut, zsd = fit(train)
xy_test = pca.transform(test[SCORE_MARKERS].values / zsd)
coverage = {str(lv): float(inside(gmm, cut, xy_test, lv).mean()) for lv in LEVELS}
print(f"train people {len(tr)}, points {len(train)}; test people {len(te)}, points {len(test)}; mixture components {gmm.n_components}")
print("variance explained by the map:", pca.explained_variance_ratio_.round(3), "total", round(float(pca.explained_variance_ratio_.sum()), 3))
print("TEST coverage of zones (target = level):", {k: round(v, 3) for k, v in coverage.items()})

# ---------------------------------------------------------------- final model on everyone
pca, gmm, cut, zsd = fit(pts)
xy_all = pca.transform(pts[SCORE_MARKERS].values / zsd)
print("final axes (rows) over", SCORE_MARKERS, "\n", np.round(pca.components_, 3), "spread", np.round(zsd, 3))
# Orient axes: axis 1 = overall level (all markers up), axis 2 = neutrophils up and lymphocytes down.
comp = pca.components_.copy()
overall = np.ones(4)
balance = np.array([1, -1, 0, 0])
order = [int(np.argmax(np.abs(comp @ overall))), None]
order[1] = 1 - order[0]
comp = comp[order]
signs = np.sign([comp[0] @ overall, comp[1] @ balance])
comp = comp * signs[:, None]
flip = np.eye(2)[order] * signs[:, None]  # maps PCA coordinates to oriented map coordinates


def to_map(Z):
    return (Z / zsd - pca.mean_) @ comp.T


def density(xy_map):
    return gmm.score_samples(xy_map @ flip)  # flip is orthonormal: map -> PCA coordinates is xy @ flip


xy_map = to_map(pts[SCORE_MARKERS].values)
assert np.allclose(density(xy_map), gmm.score_samples(xy_all))

# Zone percentile for any point: share of training checks with lower density (0 = centre, 100 = far edge)
train_dens = np.sort(gmm.score_samples(xy_all))

# Contour polygons for drawing
lim = float(np.ceil(np.quantile(np.abs(xy_map), 0.995) + 1))
gx = np.linspace(-lim, lim, 241)
GX, GY = np.meshgrid(gx, gx)
D = density(np.c_[GX.ravel(), GY.ravel()]).reshape(GX.shape)
cs = plt.contour(GX, GY, D, levels=sorted(cut[lv] for lv in LEVELS))
contours = {}
for lv, segs in zip(sorted(LEVELS, key=lambda v: cut[v]), cs.allsegs):
    contours[str(lv)] = [[[round(float(a), 3), round(float(b), 3)] for a, b in s[:: max(1, len(s) // 120)]] for s in segs if len(s) > 4]
plt.close()

# ---------------------------------------------------------------- real-world checks
def zone(xy):
    lv = density(xy)
    out = np.where(lv >= cut[0.5], "inner 50%", np.where(lv >= cut[0.9], "50-90%", np.where(lv >= cut[0.99], "90-99%", "outside 99%")))
    return out


pts["zone"] = zone(xy_map)
pts["ax1"], pts["ax2"] = xy_map[:, 0], xy_map[:, 1]
early = (pts.day > 0) & (pts.day <= 2.1)
saline = pts.arm.str.contains("Saline")
vacc = early & ~saline
sal = early & saline
outside90 = lambda k: float((density(xy_map[k.values]) < cut[0.9]).mean())
checks = {
    "vaccinatedDays1to2": {"checks": int(vacc.sum()), "outside90": outside90(vacc), "meanAxis1": float(pts.ax1[vacc].mean()), "meanAxis2": float(pts.ax2[vacc].mean())},
    "salineDays1to2": {"checks": int(sal.sum()), "outside90": outside90(sal), "meanAxis1": float(pts.ax1[sal].mean()), "meanAxis2": float(pts.ax2[sal].mean())},
    "allLaterChecks": {"checks": int((pts.day > 7).sum()), "outside90": outside90(pts.day > 7)},
}
print("\nreal-world checks:")
for k, v in checks.items():
    print(" ", k, {kk: round(vv, 3) if isinstance(vv, float) else vv for kk, vv in v.items()})

o = pd.read_csv(OSD569)
o["crew"] = o["Sample Name"].str.slice(0, 4)
o["tp"] = o["Sample Name"].str.extract(r"_(L[-+]\d+|R\+\d+)_")[0]
col = {"neu": "neutrophils", "lym": "lymphocytes", "mon": "monocytes", "eos": "eosinophils"}
i4 = []
for crew, g in o.groupby("crew"):
    pre = g[g.tp.str.startswith("L-") & ~((g.crew == "C003") & (g.tp == "L-92"))]
    n = len(pre)
    base = {m: float(np.log(pre[f"absolute_{c}_value_cells_per_microliter"]).mean()) for m, c in col.items()}
    for _, r in g[~g.tp.str.startswith("L-")].iterrows():
        z = np.array([[(math.log(r[f"absolute_{c}_value_cells_per_microliter"]) - base[m]) / (SD_SHORT[m] * math.sqrt(1 + 1 / n)) for m, c in col.items()]])
        xy = to_map(z)
        i4.append({"crew": crew, "timepoint": r.tp, "axis1": round(float(xy[0, 0]), 2), "axis2": round(float(xy[0, 1]), 2), "zone": str(zone(xy)[0])})
print("\nInspiration4 after flight (vs own preflight, no spaceflight adjustment):")
print(pd.DataFrame(i4).to_string(index=False))

model = {
    "name": "HemoScope Immune State Map",
    "type": "pca_2d_with_gaussian_mixture_zones",
    "markers": SCORE_MARKERS,
    "zSpread": [round(float(v), 6) for v in zsd],
    "pcaMean": [round(float(v), 6) for v in pca.mean_],
    "axes": [[round(float(v), 6) for v in row] for row in comp],
    "axisLabels": ["Overall Immune Cell Level", "Neutrophil-Lymphocyte Balance"],
    "mixture": {
        "weights": [round(float(v), 6) for v in gmm.weights_],
        "means": [[round(float(v), 6) for v in (np.array(mu) @ flip.T)] for mu in gmm.means_],  # in map coordinates
        "covariances": [[[round(float(v), 6) for v in row] for row in (flip.T.T @ np.array(c) @ flip.T)] for c in gmm.covariances_],
    },
    "zoneLogDensity": {str(lv): round(cut[lv], 6) for lv in LEVELS},
    "trainLogDensityQuantiles": [round(float(np.quantile(train_dens, q)), 6) for q in np.linspace(0, 1, 101)],
    "limit": lim,
    "contours": contours,
    "metrics": {
        "trainedOn": "ImmPort SDY180, SDY296, SDY301, SDY1252",
        "people": int(pts.subject.nunique()), "checks": int(len(pts)),
        "testPeople": int(len(te)), "testChecks": int(len(test)),
        "varianceExplained": round(float(pca.explained_variance_ratio_.sum()), 4),
        "mixtureComponents": int(gmm.n_components),
        "testZoneCoverage": {k: round(v, 4) for k, v in coverage.items()},
        "realWorld": checks, "inspiration4": i4,
    },
}
# self-check: map-coordinate mixture reproduces sklearn's density
def mix_logpdf(xy, mj):
    tot = np.zeros(len(xy))
    for w, mu, c in zip(mj["weights"], mj["means"], mj["covariances"]):
        c = np.array(c); diff = xy - np.array(mu)
        inv = np.linalg.inv(c)
        tot += w * np.exp(-0.5 * np.einsum("ij,jk,ik->i", diff, inv, diff)) / (2 * math.pi * math.sqrt(np.linalg.det(c)))
    return np.log(tot)
err = np.max(np.abs(mix_logpdf(xy_map, model["mixture"]) - density(xy_map)))
print("\nexport check, max log density difference:", round(float(err), 6))
with open(OUT, "w") as fh:
    json.dump(model, fh, separators=(",", ":"))
print("saved", OUT)

# Optional: record the held-out results and the model file in MLflow (does nothing if mlflow is not installed).
log_run("train_state_map",
        {**{f"statemap_zone{round(float(k) * 100)}_coverage": v for k, v in coverage.items()},
         "statemap_variance_kept": model["metrics"]["varianceExplained"]},
        [OUT])
