# LeadForge — Google Maps Lead Generation SaaS MVP

Full-stack MVP: FastAPI + SQLite backend, vanilla SPA frontend, provider layer
with a config-driven Omkar adapter and an automatic mock fallback.

## Run
pip install -r requirements.txt
python run.py        # serves http://localhost:8000

Without OMKAR_* env vars the mock provider is used (clearly indicated in the UI
and on the System Status page). Set the three secrets to switch to the real
extractor — no other change needed.

## Adapting to the installed Omkar extractor
The Omkar extractor generates its own API schema. Adjust two marked adaptation
points in app/providers/omkar.py: REQUEST_TEMPLATE (request payload) and the
response-envelope unpacking in _post(). Endpoint path is env-driven via
OMKAR_API_PATH. Do not hard-code a Google endpoint — the extractor owns the API.

## Architecture
app/config.py          env secrets + health snapshot (no secret leakage)
app/db.py              SQLite schema (jobs, raw_records, results, retry_queue, error_log)
app/reliability.py     dedup (KGMID w/ hash fallback), completeness scoring, retries
app/providers/         base / omkar / mock
app/workers/runner.py  async job runner, crash recovery, backoff retries
app/routes/            jobs, results (+CSV export), status APIs
static/                responsive SPA (hamburger nav under 860px)

## Reliability guarantees
- Raw payloads stored before normalization; results survive restarts
- Dedup per job by KGMID, content-hash fallback
- Completeness score 0–100; records under threshold flagged incomplete
- Transient provider errors retried with exponential backoff; queue persisted
- Jobs interrupted by a crash are recovered to queued on startup
- 
