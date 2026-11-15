# Train the HemoScope models on Azure Machine Learning

This runs `bash scripts/run_all.sh` on an Azure ML compute cluster and brings the finished JSON models back.
The app never calls Azure. It only reads `lib/models/`. Run the commands one at a time, from the repository root.

Files: `train-job.yml` (the job), `environment.yml` (Python 3.13 + MLflow), `compare_models.py` (check step),
and `.amlignore` in the repo root (what is not uploaded). The job installs `scripts/requirements.txt` itself, so the
package versions stay in one place.

## 1. Sign in and install the ML extension

```
az login
az extension add -n ml
az account show --query "{name:name, id:id}" -o table
```

If you have more than one subscription, pick one: `az account set --subscription "<name or id>"`.

First time on this subscription only (safe to repeat):

```
az provider register -n Microsoft.MachineLearningServices
az provider register -n Microsoft.Storage
az provider register -n Microsoft.KeyVault
az provider register -n Microsoft.ContainerRegistry
az provider register -n Microsoft.Insights
az provider register -n Microsoft.OperationalInsights
```

## 2. Resource group and workspace

```
az group create -n hemoscope-rg -l eastus
az ml workspace create -n hemoscope-ml -g hemoscope-rg -l eastus
az configure --defaults group=hemoscope-rg workspace=hemoscope-ml location=eastus
```

The last line saves the group and workspace so the commands below stay short. The workspace also creates a storage
account, key vault and Application Insights in the same group.

## 3. Compute cluster

Smallest general-purpose CPU size (1 vCPU, 3.5 GB), scales to zero when idle:

```
az ml compute create --name cpu-cluster --type AmlCompute --size Standard_DS1_v2 --min-instances 0 --max-instances 1 --idle-time-before-scale-down 120
az ml compute show --name cpu-cluster --query "{state:provisioning_state, size:size}" -o table
```

If it fails with a quota or size error, list what your region allows
(`az ml compute list-sizes --type AmlCompute -o table`), then rerun with another `--size`, for example `Standard_DS2_v2`.
A new subscription may have to request quota for the DSv2 family in the portal.

## 4. Submit the job

```
JOB=$(az ml job create -f azure/train-job.yml --query name -o tsv)
echo $JOB
```

The first run builds the environment (about 10 minutes). Later runs reuse it. The training itself takes a few minutes.

## 5. Stream the logs

```
az ml job stream -n $JOB
az ml job show -n $JOB --query "{status:status, studio:services.Studio.endpoint}" -o yaml
```

Status ends as `Completed`. The studio link shows the run's MLflow metrics (forecast 95% range coverage and median
error per marker; state map 50/90/99% zone coverage and variance kept) and the two model files as artifacts.

## 6. Download the "models" output

```
az ml job download -n $JOB --output-name models --download-path ../hemoscope-azure-output
ls ../hemoscope-azure-output/named-outputs/models
```

(The folder sits outside the repo so it cannot be committed by accident.)
Expected: `forecast-model.json`, `state-map.json`, `parity-cases.json`, `risk-model-results.json`.

## 7. Register both models

```
az ml model create --name hemoscope-forecast --version 1 --type custom_model --path ../hemoscope-azure-output/named-outputs/models/forecast-model.json
az ml model create --name hemoscope-state-map --version 1 --type custom_model --path ../hemoscope-azure-output/named-outputs/models/state-map.json
az ml model list -o table
```

To register a new version later, change `--version`.

## 8. Compare with lib/models/

```
python azure/compare_models.py ../hemoscope-azure-output
```

It prints one line per file. `IDENTICAL` means the same bytes. `SAME NUMBERS` means the same except the last digit of
a few unrounded values (see below). `DIFFERENT` means a real change, so do not copy the files into `lib/models/`.
(`diff -r` or `cmp` also work for a plain byte check.)

Byte-for-byte identical is only guaranteed on the machine that made the committed files. The same maths on another
machine can differ in the 16th digit of a few unrounded numbers (`state-map.json` metrics, `parity-cases.json`).
Training on a laptop gave exactly that. The forecast model and the dataset came out byte-identical, and `npm test` passes
either way.

## 9. Clean up

**Keep the workspace until judging is finished.**

Stop paying for everything created above by deleting the resource group:

```
az ml workspace delete -n hemoscope-ml --all-resources --permanently-delete --yes
az group delete -n hemoscope-rg --yes --no-wait
az configure --defaults group= workspace= location=
```

The cluster costs nothing while idle (minimum 0 nodes), but the workspace's storage account, key vault and container
registry do cost a little each month, so delete them when you are done. `--permanently-delete` frees the workspace name
so you can create `hemoscope-ml` again. To keep the workspace and remove only the cluster:
`az ml compute delete -n cpu-cluster --yes`.

## Running the scripts with MLflow on your own computer

`pip install mlflow` makes `train_forecast_model.py` and `train_state_map.py` log their results and model files to
MLflow. Without it they behave exactly as before. If MLflow is installed but cannot log, they print a warning and
finish normally.
