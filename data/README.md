# Data

The training data used by HemoScope, with its sources and terms.

| Path | What it is | Source |
|---|---|---|
| `raw/OSD-569_Complete_Blood_Count.csv` | Complete blood counts for the four Inspiration4 crew members (preflight, landing and recovery). Used for the demo astronauts' preflight values and as a real-world check. | NASA Open Science Data Repository, OSD-569 |
| `immport/SDY180/` | Healthy adults given a 2009-2010 Fluzone influenza vaccine, Pneumovax 23, or a saline placebo, sampled from 7 days before to 28 days after. | ImmPort SDY180 |
| `immport/SDY296/` | Healthy adults, 2011-2012 season (study group "AIRFV 2011-12"). | ImmPort SDY296 |
| `immport/SDY301/` | Healthy adults, 2012-2013 season (study group "AIRFV 2012-13"); 26 people also appear in SDY296. | ImmPort SDY301 |
| `immport/SDY1252/` | Adults given an H5N1 influenza vaccine with or without the AS03 adjuvant. | ImmPort SDY1252 |
| `processed/cbc.csv` | All four ImmPort studies combined, one row per blood sample, counts in 10^3 cells per microliter. Built by `scripts/build_dataset.py`. | Derived from the ImmPort files above |

Each ImmPort folder holds four tables from the study's "Tab" download: `lab_test.txt` (the blood counts), `biosample.txt` (when each sample was taken), `arm_or_cohort.txt` and `arm_2_subject.txt` (which study group each person was in). Demographic tables were left out because they are not needed.

## Totals

- 1,286 ImmPort blood samples from 120 people, in 146 person-study series (26 people are in both SDY296 and SDY301). Two samples with obvious entry errors are removed during training.
- 28 Inspiration4 samples from 4 crew members.

## Credit and terms

**ImmPort.** Data from the NIAID Immunology Database and Analysis Portal (ImmPort), studies SDY180, SDY296, SDY301 and SDY1252 (https://www.immport.org/shared/study/SDY180 and the same address for the other study numbers; see each page for the study title and investigators). The ImmPort user agreement allows use and redistribution under terms commensurate with that agreement, requires acknowledging ImmPort and the data providers, and forbids any attempt to identify study participants. Anyone using this folder must follow the same terms: https://docs.immport.org/home/agreement/

Cite ImmPort as: Bhattacharya S, et al. ImmPort, toward repurposing of open access immunological assay data for translational and clinical research. Sci Data. 2018;5:180015.

**NASA OSDR.** Inspiration4 complete blood count, OSD-569, NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo/data/studies/OSD-569).
