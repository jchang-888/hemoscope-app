"""Optional MLflow logging for the training scripts.

If the `mlflow` package can be imported, log_run() records the held-out results and the model JSON files in
MLflow. In an Azure ML job it joins the job's own run (MLFLOW_RUN_ID is set) and leaves it open for the job to
close; anywhere else it starts a run of its own and ends it. If mlflow cannot be imported, log_run() does
nothing: no output, no extra files, so the models and printed results are exactly the same as without this file.
Logging never stops training: if MLflow is installed but fails (for example no tracking server), a warning
is printed to stderr and the script still finishes normally.
"""
import os
import sys


def log_run(name, metrics, artifacts):
    try:
        import mlflow
    except Exception:  # not installed (the normal case on a laptop): do nothing
        return
    try:
        joined = "MLFLOW_RUN_ID" in os.environ  # inside an Azure ML job: the job's run already exists
        mlflow.start_run(run_name=None if joined else name)
        try:
            mlflow.log_metrics({k: float(v) for k, v in metrics.items()})
            for path in artifacts:
                mlflow.log_artifact(path)
        finally:
            if not joined:
                mlflow.end_run()
    except Exception as e:
        print(f"warning: MLflow logging skipped for {name}: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
