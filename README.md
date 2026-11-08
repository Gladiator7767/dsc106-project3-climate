# Exploring Regional Warming Under Different Climate Scenarios

DSC 106 Project 3 — team review version, November 8, 2026.

Website: https://gladiator7767.github.io/dsc106-project3-climate/

Repository: https://github.com/Gladiator7767/dsc106-project3-climate

## Open locally

Run `start-preview.cmd`, keep that window open, then visit http://localhost:8116/.
Alternatively run `python -m http.server 8116 --bind 127.0.0.1` in this directory.
Opening `index.html` with a `file://` URL will not load the JSON data reliably.

## What is included

- `index.html`: linked D3 map selection, brushed timeline, retained reference period A,
  current period B, regional and individual-model comparisons, sorting, exact table
  and CSV export. The timeline can show warming or the paired scenario gap.
- `exploration.html`: six distinct exploratory charts for the checkpoint video.
- `writeup.html`: English rationale, methods and limitations; development log pending.
- `data/climate.csv`, `climate.json`: actual processed CMIP6 data, 4,032 rows.
- `data/provenance.json`: exact source paths, model coverage, checks and CSV hash.

## Data and calculation

Three availability-selected CMIP6 models; one realization (`r1i1p1f1`) each.
Historical 1995–2014 is the model-specific regional baseline. Future scenarios are
SSP1-2.6 and SSP5-8.5, 2015–2100. Monthly temperature uses native-cell area weights,
then calendar-day weights within years. Regions include land and ocean. Global is
calculated over all cells, not as an equal mean of the latitude bands.

Six latitude bands are defined using cell centers. Period means weight years equally;
ensemble summaries weight models equally. Ranges are min–max across the three models,
not confidence intervals. No missing values are imputed. These projections are
conditional, not forecasts, and are not relative to preindustrial temperature.

For each model and period, the scenario gap is SSP5-8.5 minus SSP1-2.6.
The change is that model's B gap minus its A gap. Ensemble means and ranges are
computed after pairing, not by subtracting unrelated scenario extremes.
Trailing ten-year smoothing affects the timeline only. All period comparisons
use the original annual values. Single-year, overlapping and unequal-length
periods are supported; overlap and unequal lengths are flagged on screen.

## Try the Final interaction

1. Select Arctic. Keep A at 2021–2040 and B at 2081–2100.
2. Read the A and B gaps together. In this subset their means are about 0.24°C
   and 6.61°C, a change of 6.37°C.
3. Brush a new B interval or use a preset. A remains visible for comparison.
4. Sort regions by B minus A, then inspect all three individual models below.
5. Choose a model, switch timeline measures, or export the full comparison.
   Reset restores the initial choices.

## Verification record

The detailed interaction and data audit was completed on November 7.
On November 8, the user-translated writeup was installed with terminology
corrections and a shorter ending; visualization code and data were unchanged.

- `scripts/validate_final_calculations.cjs`: 13,022 numerical assertions against
  independently recomputed annual-data calculations, including boundary cases.
- The actual browser CSV download was checked: 28 rows and 532 numeric fields.
- Browser checks covered brushing, period editing, model selection, sorting,
  keyboard controls, reset, CSV export, and a 390-pixel mobile viewport.
- All 22 frozen Checkpoint artifacts retain their original SHA-256 hashes.
- These checks do not substitute for a measured frame-rate benchmark, an
  independent first-time-user session, or a fresh download of the raw CMIP6 data.

The Final portable review package is separate from the frozen Checkpoint package.
In the Final ZIP, `offline/` contains embedded-data HTML for teammate review;
`website-source/` contains the conventional static site for GitHub Pages.

## Rebuild data

Use Python 3.11+, install `requirements.txt` in an isolated environment, then run
`python scripts/build_data.py`. Internet access is required for the public archive.
The script downloads the catalog and caches per-model aggregates under `data/raw/`.
If changing transformation logic, rebuild those caches in a new directory or remove
only the affected per-model aggregate cache after retaining a backup.
Browser code needs no build step and does not contact the archive at runtime.
The bundled D3 is the sole plotting library; TopoJSON only decodes map geometry.

## Review and submission status

This dedicated public repository serves its `main` branch root through GitHub Pages.
Publication is for team review and does not submit the assignment to Gradescope.
Do not upload `.python/`,
`data/raw/`, `output/`, `tmp/` or the preparation directory containing internal drafts.
The team has explicitly left actual roles, people-hours and the most time-consuming
work blank for later completion. Fill them before final submission. The writeup is
an AI-assisted review draft for the team to review and revise.
Checkpoint requires a voiced MP4 of at most two minutes;
the website alone is not the checkpoint submission.

Official requirements: https://dsc106.com/projects/project3/
Checkpoint: November 5, 2026, 11:59 PM. Final: November 13, 2026, 11:59 PM
(extended deadline, verified November 8). The current Final instructions require
a public webpage URL, not a new video. The two-minute MP4 applies to Checkpoint.
