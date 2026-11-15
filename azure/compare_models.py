"""Compare the models downloaded from Azure ML with lib/models/ and docs/experiments/.

Usage: python azure/compare_models.py <downloaded folder>
Prints, for every JSON file: IDENTICAL (same bytes), SAME NUMBERS (equal within 1e-9, only the last digits of
some unrounded values differ, which happens when the same maths runs on a different machine), or DIFFERENT.
Exit code 1 only if a file is DIFFERENT or missing.
"""
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ["lib/models/forecast-model.json", "lib/models/state-map.json", "lib/models/parity-cases.json",
         "docs/experiments/risk-model-results.json"]


def close(a, b):
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(close(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(close(x, y) for x, y in zip(a, b))
    if isinstance(a, float) or isinstance(b, float):
        return isinstance(a, (int, float)) and isinstance(b, (int, float)) and math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12)
    return a == b


down = pathlib.Path(sys.argv[1])
if (down / "named-outputs" / "models").is_dir():
    down = down / "named-outputs" / "models"
bad = 0
for rel in FILES:
    mine, theirs = ROOT / rel, down / pathlib.Path(rel).name
    if not theirs.exists():
        print(f"MISSING    {rel} (not in {down})"); bad += 1
    elif mine.read_bytes() == theirs.read_bytes():
        print(f"IDENTICAL  {rel}")
    elif close(json.loads(mine.read_text()), json.loads(theirs.read_text())):
        print(f"SAME NUMBERS  {rel} (only last-digit rounding differs)")
    else:
        print(f"DIFFERENT  {rel}"); bad += 1
sys.exit(1 if bad else 0)
