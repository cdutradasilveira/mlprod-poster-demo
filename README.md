# ML Productionization Demo

Interactive demo of the four canonical ML productionization methods described in
**Booking.com — "Machine Learning in production: the Booking.com approach"**
(Lucas Bernardi, 2019). The user picks a `(model × method)` combination, runs single
or stress-test predictions against a synthetic booking dataset, and watches latency,
hits, misses and per-method trade-offs in real time. Built for a Master's class
presentation.

---

## What's in the demo

**4 models** — each trained with a different library on the same synthetic dataset:

| Model | Library | Typical AUC test | AUC train | Gap |
|---|---|---|---|---|
| Logistic Regression | scikit-learn | ~0.74 | ~0.75 | +0.01 |
| Random Forest       | scikit-learn | ~0.78 | ~0.89 | +0.11 |
| Gradient Boosting   | XGBoost      | ~0.78 | ~0.90 | +0.13 |
| MLP                 | PyTorch      | ~0.77 | ~0.80 | +0.03 |

The four complex models cluster around AUC ~0.78 (the training data isn't a
clear winner-takes-all problem); what differentiates them is **train/test gap**,
and that's the column Tab 2 highlights.

**4 productionization methods** — each implemented under one common `Server`
interface (`backend/app/serving/base.py`):

| Method | How it serves | Stack at runtime |
|---|---|---|
| **Lookup** | `GET pred:{model}:{user}:{hotel}` from Redis | redis client only |
| **GLM**    | `σ(W·x + b)` with numpy on extracted weights | numpy only (no sklearn) |
| **Native** | The training library's predict API | sklearn / xgboost / torch |
| **Scripted** | Python script: native predict + cold-start blend + diversity penalty + clip | same as Native + extras |

**Compatibility matrix** (enforced everywhere — UI rejects invalid combos with
the paper-anchored reason):

| Model \ Method | Lookup | GLM | Native | Scripted |
|---|---|---|---|---|
| Logistic Regression | ✅ | ✅ | ✅ | ✅ |
| Random Forest | ✅ | ❌ — not linear in weights | ✅ | ✅ |
| Gradient Boosting | ✅ | ❌ — not linear in weights | ✅ | ✅ |
| MLP | ✅ | ❌ — not linear in weights | ✅ | ✅ |

---

## Quickstart

Prereqs: **Docker Desktop**, **Node 20+**, **Python 3.11** (only needed if you
want to run the training scripts outside Docker — recommended path keeps
everything in containers because xgboost + torch coexist cleanly on Linux but
clash on macOS ARM).

```bash
# 1. Bring up Redis + backend
docker compose up -d redis backend

# 2. Generate the synthetic dataset, train the four models, populate Redis
docker compose exec backend python scripts/generate_data.py
docker compose exec backend python scripts/train_all.py
docker compose exec backend python scripts/populate_lookup.py

# 3. Start the frontend
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Backend is at <http://localhost:8000/api>.

If you want a local Python env for IDE autocomplete (not for running the
pipeline), use **homebrew Python 3.11**, not conda:

```bash
brew install python@3.11
cd backend
/opt/homebrew/bin/python3.11 -m venv .venv
.venv/bin/pip install --extra-index-url https://download.pytorch.org/whl/cpu \
  -r requirements.txt
```

---

## Architecture

```
backend/                          FastAPI + Pydantic v2 + uvicorn
├── app/
│   ├── api/                      11 endpoints under /api/*
│   ├── serving/                  base.py + lookup.py + glm.py + native.py + scripted.py + factory.py
│   ├── models_io/registry.py     in-memory feature store (users + hotels)
│   ├── data/synthetic.py         deterministic data generator
│   └── metrics/{serving,radar}.py per-combo latency accumulator + radar axes
├── scripts/                      generate_data.py, train_all.py, populate_lookup.py
└── artifacts/                    gitignored — models, parquets, model_quality.json
frontend/                         Vite + React + TS + Tailwind + shadcn/ui + Recharts
└── src/
    ├── App.tsx                   header + 4 tabs + Reset Metrics + ThemeToggle
    ├── components/               ServingTab, QualityTab, ComparisonTab, MatrixTab + ~25 sub-components
    └── lib/                      api.ts (typed client), types.ts, theme.ts (palette + formatters)
```

### Endpoints (all under `/api/`)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health` | liveness |
| GET  | `/methods`, `/compatibility` | method list, 4×4 matrix with paper-anchored reasons |
| GET  | `/models`, `/models/metrics` | model list, full `model_quality.json` (AUC test/train, ROC, PR, CM, importances) |
| GET  | `/sample-inputs` | 30 users (precomputed/non-precomputed mix) + 30 hotels |
| POST | `/predict` | single prediction; 400 with reason for invalid combos; 200 + `probability:null` for lookup miss |
| POST | `/stress-test` | synchronous N requests, returns full latencies + percentiles |
| GET  | `/stress-test/stream` | SSE; emits `progress` events with batch latencies + `done` event |
| POST | `/compare` | runs N requests on every valid combo, returns p50/p95/p99 + AUC (read from `model_quality.json`) |
| GET  | `/lookup/status` | `{populated, key_count, per_model}` — drives the frontend banner |
| GET  | `/metrics`, POST `/metrics/reset` | rolling per-combo snapshots; reset clears in-memory accumulator |

### Why everything runs in Docker

XGBoost and PyTorch each ship their own `libomp.dylib` on macOS ARM and
crash with `SIGSEGV` when both are loaded into the same Python process.
On Linux they share `libgomp` and coexist. We confirmed this with a one-line
test and decided to keep the entire pipeline (training + serving) in the
backend container, so the demo is portable to any machine with Docker and
no `OMP_NUM_THREADS=1` workarounds taint MLP latency.

---

## Demo script (~5 minutes live)

The UI is built around this exact flow:

1. **Tab 2 — Model Quality (~30 s)**
   "Four models, four libraries. AUC test ranges from 0.74 (LogReg) to ~0.78
   (RF/XGB/MLP). But look at the **Gap** column: RF and XGB memorize training
   noise (gap > 0.10), MLP generalizes cleanly (gap 0.03). The serving method
   doesn't change quality — only how we deliver predictions."

2. **Tab 1 — Serving (~2 min)**
   - Pick **LogReg + Lookup** → Predict. ~0.06 ms (Redis GET).
   - Switch to **GLM** (same input). Same probability (proves the weights
     were extracted correctly). Latency similar — paper §4 explicitly puts
     Lookup and GLM "at the origin" of the trade-off plane.
   - Switch to **Native**. Latency goes up; it's the sklearn predict overhead.
   - Click **Force lookup miss** → re-run Lookup. `outcome=miss`, `probability=—`.
   - Try **RF + GLM**. Red callout with paper-cited reason ("GLM only
     supports models linear in their parameters — see paper, Section 3.2").
     Click **Why?** for the dialog.

3. **Stress test (~1 min)**
   - 1000 reqs on **LogReg + Lookup**. Histogram peaks below 0.1 ms.
   - 1000 reqs on **MLP + Native**. Histogram shifts to ~1–3 ms.
   - History table at the bottom captures both runs.

4. **Tab 3 — Comparison (~1 min)**
   - "Run full comparison" with 500 reqs/combo (~7 s).
   - Latency-vs-AUC scatter with Pareto frontier in green dashed.
   - "This is the trade-off plane the paper describes, made measurable."

5. **Tab 4 — Matrix (~30 s)**
   - 4×4 grid. Hover red cells for paper-anchored reasons. Hover green
     cells for current p95 latency.
   - Closing message: "Different problems pick different cells in this
     matrix. RS at Booking is the system that makes any cell available."

---

## Troubleshooting

- **"Lookup table not populated" yellow banner**: Redis was wiped or
  `populate_lookup.py` was never run. Fix:
  ```bash
  docker compose exec backend python scripts/populate_lookup.py
  ```
  ~4 s for all 4 models × 500k keys.

- **Backend says "model_quality.json not found"**: training never ran.
  Run `generate_data.py` then `train_all.py` (in that order).

- **Docker Desktop went idle** mid-build: just `open -a Docker` and wait
  ~30 s for the daemon to come back. Containers will resume.

- **`docker compose exec` complains the file isn't there**: the dev
  bind-mount on `./backend/app` and `./backend/scripts` lets you edit
  Python without rebuilding the image. Make sure the file exists locally.

- **xgboost + torch SIGSEGV when running locally on macOS ARM**: known
  conflict between two `libomp.dylib` copies. Run inside Docker. Don't try
  to patch with `OMP_NUM_THREADS=1` — that inflates MLP latency in the demo.

---

## License

Internal class project. Paper credit to Lucas Bernardi (Booking.com).
