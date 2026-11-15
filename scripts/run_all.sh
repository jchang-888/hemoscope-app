#!/usr/bin/env bash
# Retrains every HemoScope model from the raw data in data/. Run from the repository root:
#   bash scripts/run_all.sh
# Takes a few minutes. The app only needs the JSON files this writes to lib/models/.
set -euo pipefail

python scripts/build_dataset.py data/immport data/processed/cbc.csv
python scripts/train_forecast_model.py data/processed/cbc.csv lib/models/forecast-model.json
python scripts/train_state_map.py data/processed/cbc.csv data/raw/OSD-569_Complete_Blood_Count.csv lib/models/state-map.json
python scripts/make_parity_cases.py lib/models/state-map.json lib/models/parity-cases.json
python scripts/experiment_risk_model.py data/processed/cbc.csv docs/experiments/risk-model-results.json

echo "Done. Run npm test to check the app still matches the models."
