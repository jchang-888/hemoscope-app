"""Builds one table of complete blood counts from ImmPort SDY180, SDY296, SDY301 and SDY1252.
Output: cbc.csv with one row per blood sample. Counts in 10^3 per microliter (= 10^9/L)."""
import sys
import pandas as pd

ROOT = sys.argv[1]
OUT = sys.argv[2]

NAMES = {
    # name reported -> (marker, kind)
    "Leukocytes": ("wbc", "abs"), "White Blood Cell count": ("wbc", "abs"), "WBC_Count": ("wbc", "abs"),
    "Neutrophils": ("neu", "abs"), "neutrophil count": ("neu", "abs"), "Neutrophils_Absolute": ("neu", "abs"),
    "Lymphocytes": ("lym", "abs"), "lymphocyte count": ("lym", "abs"), "Lymphocytes_Absolute": ("lym", "abs"),
    "Monocytes": ("mon", "abs"), "monocyte count": ("mon", "abs"), "Monocytes_Absolute": ("mon", "abs"),
    "Eosinophils": ("eos", "abs"), "eosonophil count": ("eos", "abs"), "Eosinophils_Absolute": ("eos", "abs"),
    "Basophils": ("bas", "abs"), "basophil count": ("bas", "abs"), "Basophils_Absolute": ("bas", "abs"),
    "neutrophil percentage": ("neu", "pct"), "Neutrophils %": ("neu", "pct"),
    "lymphocyte percentage": ("lym", "pct"), "Lymphocytes %": ("lym", "pct"),
    "monocyte percentage": ("mon", "pct"), "Monocytes %": ("mon", "pct"),
    "eosonophil percentage": ("eos", "pct"),
    "basophil percentage": ("bas", "pct"), "Basophils %": ("bas", "pct"),
}
# SDY1252 reports eosinophil percent under the plain name "Eosinophils"
SDY1252_EXTRA = {"Eosinophils": ("eos", "pct")}

frames = []
for study, folder in [("SDY180", "SDY180"), ("SDY296", "SDY296"), ("SDY301", "SDY301"), ("SDY1252", "SDY1252")]:
    lab = pd.read_csv(f"{ROOT}/{folder}/lab_test.txt", sep="\t", low_memory=False)
    bio = pd.read_csv(f"{ROOT}/{folder}/biosample.txt", sep="\t", low_memory=False)
    names = dict(NAMES)
    if study == "SDY1252":
        names.update(SDY1252_EXTRA)
    lab = lab[lab.NAME_REPORTED.isin(names)].copy()
    lab["marker"] = lab.NAME_REPORTED.map(lambda n: names[n][0] + ("_pct" if names[n][1] == "pct" else ""))
    lab["value"] = pd.to_numeric(lab.RESULT_VALUE_REPORTED, errors="coerce")
    wide = lab.pivot_table(index="BIOSAMPLE_ACCESSION", columns="marker", values="value", aggfunc="first")
    bio = bio.set_index("BIOSAMPLE_ACCESSION")
    t = bio.STUDY_TIME_COLLECTED.astype(float)
    t = t.where(bio.STUDY_TIME_COLLECTED_UNIT != "Hours", t / 24.0)
    wide["day"] = t.reindex(wide.index)
    wide["subject"] = bio.SUBJECT_ACCESSION.reindex(wide.index)
    wide["t0"] = bio.STUDY_TIME_T0_EVENT.reindex(wide.index)
    wide["study"] = study
    a2s = pd.read_csv(f"{ROOT}/{folder}/arm_2_subject.txt", sep="\t") if __import__("os").path.exists(f"{ROOT}/{folder}/arm_2_subject.txt") else None
    if a2s is not None:
        arms = pd.read_csv(f"{ROOT}/{folder}/arm_or_cohort.txt", sep="\t").set_index("ARM_ACCESSION").NAME
        m = a2s.drop_duplicates("SUBJECT_ACCESSION").set_index("SUBJECT_ACCESSION").ARM_ACCESSION.map(arms)
        wide["arm"] = wide.subject.map(m)
    else:
        wide["arm"] = study
    frames.append(wide.reset_index())

df = pd.concat(frames, ignore_index=True)
cols = ["study", "subject", "arm", "t0", "day", "BIOSAMPLE_ACCESSION", "wbc", "neu", "lym", "mon", "eos", "bas",
        "neu_pct", "lym_pct", "mon_pct", "eos_pct", "bas_pct"]
for c in cols:
    if c not in df:
        df[c] = float("nan")
df = df[cols].dropna(subset=["wbc", "neu", "lym", "mon", "eos"])
df = df.sort_values(["study", "subject", "day"])
df.to_csv(OUT, index=False)
print(df.groupby("study").agg(samples=("wbc", "size"), subjects=("subject", "nunique"),
                             with_pct=("neu_pct", lambda s: s.notna().sum())))
print("total", len(df), "subjects", df.subject.nunique())
print(df.describe().T[["mean", "50%", "min", "max"]].round(2))
