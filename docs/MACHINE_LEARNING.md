# HemoScope Machine Learning

HemoScope has two machine learning models. Both are trained offline from real blood counts, saved as small JSON
files in `lib/models/`, and run in the browser with no connection needed. Everything needed to retrain them is in
this repository: raw data in `data/`, scripts in `scripts/`, and this write-up.

```
pip install -r scripts/requirements.txt
bash scripts/run_all.sh   # retrains every model from data/ (a few minutes)
npm test                  # proves the app's TypeScript gives the same numbers as the Python
```

Running `run_all.sh` on a clean copy reproduces the model files exactly (checked byte for byte).

## Training data

| | |
|---|---|
| Source | ImmPort studies SDY180, SDY296, SDY301, SDY1252 (see `data/README.md` for credit and terms) |
| Samples | 1,286 complete blood counts from 120 healthy adults, 146 person-study series |
| Cleaning | 2 samples whose cell types add up to more than 115% of white cells (clear entry errors, for example a lymphocyte count of 17.0 typed for 1.70) are removed. One sample per series per day. 1,284 samples remain. |
| Baseline | The first two samples of each series act as the personal baseline, like preflight checks in the app. |
| Testing | Every model is tested on people it never saw: 30% of people are held out (grouped by person, so the same person is never in both the training and test sets, even across SDY296 and SDY301). |

Inspiration4 (`data/raw/OSD-569_Complete_Blood_Count.csv`) is not used for training. It supplies the demo
astronauts' preflight values and is used as a real-world check.

---

## Model 1: Next Blood Check Forecast

**What it does.** Predicts each marker's next value and a 95% range from the astronaut's own history, after the
spaceflight adjustment. In the app: forecast ranges on the Health History charts, the Forecast column ("As expected" /
"Not what we expected"), and "Next check expected between X and Y".

**Method.** A Kalman filter (local level model) for each marker (white cells, neutrophils, lymphocytes, monocytes,
eosinophils), on the natural log of the count. The hidden state is the person's true level. Each new sample pulls
the estimate toward it by the Kalman gain; between samples the level can drift.

- Forecast: mean = current level; variance = level uncertainty + q x (days since last check / 30) + r²
- Update: gain k = predicted variance / (predicted variance + r²); level += k x (new log value - level)
- In the app, values are divided by the spaceflight multiplier before filtering and multiplied back for display.

**What is learned.** For each marker, the drift q and measurement noise r, by maximum likelihood over a grid, on
training people only. Final parameters (in `forecast-model.json`) are refit on everyone.

**Results on 36 unseen people (1,420 forecasts):**

| Marker | 95% range contains the real value | Median error | Median error, repeating last value |
|---|---|---|---|
| White cells | 97.2% | 10.3% | 12.4% |
| Neutrophils | 96.5% | 15.7% | 17.8% |
| Lymphocytes | 96.8% | 11.1% | 14.4% |
| Monocytes | 95.8% | 16.5% | 20.0% |
| Eosinophils | 94.0% | 19.6% | 17.6% |
| **All** | **96.1%** (target 95%) | **14.7%** | **16.4%** |

The headline number is range coverage: the 95% range really contains the next value about 95% of the time.
Point forecasts beat simply repeating the last value for four of five markers. Exact values cannot be predicted
much better than this, because blood counts naturally vary 10 to 30% between draws. Eosinophils are the noisiest.

Files: `scripts/train_forecast_model.py`, `lib/models/forecast-model.json`, `forecastSeries()` in `lib/ml.ts`.

---

## Model 2: Immune State Map

**What it does.** Turns each blood check into a point on a 2D map and draws the astronaut's mission as a path. The
background zones show how common each pattern is among healthy people's repeat checks. The map shows the direction
of a change; the status still comes from the Immune Deviation Score and the safety rules.

**Method.**
1. Input: the four z-scores of the Immune Deviation Score (neutrophils, lymphocytes, monocytes, eosinophils), each
   measured against the person's own baseline.
2. Each z-score is divided by its real spread in healthy repeat checks (neutrophils 1.44, lymphocytes 1.21,
   monocytes 1.04, eosinophils 1.65), so no single noisy marker dominates.
3. PCA (unsupervised) finds the two directions in which real blood counts vary most:
   - **Axis 1, Overall Immune Cell Level:** all four cell types up together (weights 0.40, 0.49, 0.65, 0.43).
   - **Axis 2, Neutrophil-Lymphocyte Balance:** neutrophils up while lymphocytes and eosinophils go down
     (weights 0.67, -0.42, 0.26, -0.55). This is the stress pattern the neutrophil-to-lymphocyte ratio tracks.
   The two axes keep 73% of the variation (71% in the final model).
4. A Gaussian mixture model (number of components picked by BIC: 4 on training people, 3 on everyone) learns the
   shape of where healthy checks fall. Contours mark the edges holding 50%, 90% and 99% of checks. Zones:
   Very Common (inside 50%), Common (50 to 90%), Uncommon (90 to 99%), Rare (beyond 99%).

**Results on 36 unseen people (301 checks):** does each zone hold the share it should?

| Zone edge | Target | Unseen people |
|---|---|---|
| 50% | 50% | 51.2% |
| 90% | 90% | **92.0%** |
| 99% | 99% | 99.7% |

**Real-world checks.**
- Days 1 to 2 after vaccination moved toward the neutrophil side of the balance axis (mean +0.46, vs +0.21 after
  saline), but the difference is small and the saline group has only 17 checks, so we do not claim the map detects
  vaccine responses.
- Inspiration4 crew after landing (against their own preflight checks): all 16 checks fall inside the 90% zone.
  This was a 3-day mission, and changes were small.
- Demo astronauts: Astronaut D's day 46 neutrophil rise moves clearly toward the neutrophil side (axis 2 = 1.5).

**Design decisions.**
- We first tried clustering (k-means). Silhouette scores were only 0.19 to 0.24: real blood counts form one
  continuous cloud, not separate groups, so cluster labels would have been invented categories. We use zones
  learned from healthy data instead.
- Without step 2, PCA followed eosinophils (the noisiest marker) and a large lymphocyte drop barely moved the map.
  Scaling first fixed this.
- Zone names describe how common a pattern is, never "normal", so the map cannot contradict a status.

Files: `scripts/train_state_map.py`, `lib/models/state-map.json`, `mapPath()` and `mapPoint()` in `lib/ml.ts`.

---

## How the app is checked against the Python

`scripts/make_parity_cases.py` writes inputs and the outputs Python computes for them to
`lib/models/parity-cases.json`. `lib/ml.test.ts` runs the same inputs through `lib/ml.ts` and requires the same
map position, density, zone and typicality. The tests also check forecast behavior, that every demo astronaut gets a
map path, and that the saved metrics stay above their targets.

---

## Trained on Azure Machine Learning

Both models were also trained on Azure Machine Learning. The Azure ML command job in `azure/train-job.yml` runs
`scripts/run_all.sh` on a small CPU cluster (`Standard_DS1_v2`, 1 vCPU, scales to zero when idle). The training steps
log their held-out metrics to MLflow (forecast 95% range coverage and median error per marker; state map 50/90/99%
zone coverage and variance kept), and both finished models are registered in the workspace (`hemoscope-forecast` and
`hemoscope-state-map`, version 1).

The models downloaded from the job match the ones in `lib/models/`. The forecast model is identical byte for byte.
`state-map.json`, `parity-cases.json` and the risk-experiment results differ only in the last digit of a few
unrounded numbers, which is what the same maths gives on a different machine; `azure/compare_models.py` reports
this as "same numbers", and the model parameters are the same. The app never calls Azure. Step-by-step commands are in
`azure/README.md`.

---

## Tried and not used

**Measurement-error detector** (gradient-boosted trees, trained on real counts with simulated entry errors). It
reached 94% accuracy on unseen people and caught every known real error, but it could not reliably tell a very
large real change from a typo when percentages were not entered, and it overlapped with the simpler rule-based check
already in the app. Removed.

**Immune risk forecast** (chance the next check scores Unusual, from 2,000 simulated next checks per forecast plus
logistic calibration). On unseen people: AUC 0.60 and a Brier score of 0.146, slightly worse than always predicting
the average rate (0.140). In healthy people an Unusual next check is mostly random day-to-day variation, so there is
nothing reliable to predict. Not used. Script: `scripts/experiment_risk_model.py`; results:
`docs/experiments/risk-model-results.json`.

## Note for the team: the Immune Deviation Score's spread values

While building the map we measured how wide real day-to-day variation is in these healthy repeat checks. It is wider
than the within-person values in `lib/config.ts` (from the CCLM 2017 biological variation study): neutrophils 1.44
times, lymphocytes 1.21, monocytes 1.04, eosinophils 1.65. With a two-sample baseline, 19.7% of healthy repeat checks
score 95 or higher instead of the intended 5%. Likely reasons: different labs, sampling times and conditions than the
reference study, and only two baseline samples. This does not change the models above, but it is worth reviewing
before the competition (for example, widening the spread values or requiring three baseline samples).
