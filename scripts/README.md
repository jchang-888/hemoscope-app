# Training scripts

These run on a computer, never in the app. The app only reads the finished models in `lib/models/`.
Full method and results: [docs/MACHINE_LEARNING.md](../docs/MACHINE_LEARNING.md).

## Train everything

From the repository root:

```
pip install -r scripts/requirements.txt
bash scripts/run_all.sh
npm test
```

## Files

| File | What it does |
|---|---|
| `hemoscope_ml.py` | Shared code: data loading, Immune Deviation Score, Kalman filter, seeded random numbers. Mirrors `lib/ml.ts`. |
| `build_dataset.py` | Builds `data/processed/cbc.csv` (one row per blood sample) from the ImmPort tables in `data/immport/`. |
| `train_forecast_model.py` | Model 1: next blood check forecast. Writes `lib/models/forecast-model.json`. |
| `train_state_map.py` | Model 2: Immune State Map. Writes `lib/models/state-map.json`. |
| `make_parity_cases.py` | Writes `lib/models/parity-cases.json`, which `lib/ml.test.ts` uses to prove the app gives the same numbers as Python. |
| `experiment_risk_model.py` | Experiment only, not used in the app: chance the next check is Unusual. Results in `docs/experiments/`. |
| `mlflow_log.py` | Optional MLflow logging used by the two training scripts. Does nothing unless `mlflow` is installed. |
| `run_all.sh` | Runs all of the above in order. |

If you change the math in `hemoscope_ml.py` or a training script, make the same change in `lib/ml.ts`, rerun `run_all.sh`, and run `npm test`.

To train on Azure Machine Learning instead of this computer, see [azure/README.md](../azure/README.md).
