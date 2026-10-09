# LeadForge
### A resilient Google Maps lead-collection prototype

LeadForge is a small full-stack application for running lead-collection jobs, tracking their progress, storing source responses, and exporting normalized records. It uses FastAPI and SQLite with a provider interface so the job pipeline can be developed without depending on a live extraction provider.

> **Project status:** MVP / prototype. The mock provider is useful for development and UI checks; it does not represent live Google Maps data. Confirm provider authorization, platform terms, privacy obligations, and data rights before collecting or using real records.

## What it is designed to do

- Create and track collection jobs.
- Keep raw provider responses so normalization can be reviewed later.
- Normalize and deduplicate records, preferring a stable provider ID and falling back to a content hash.
- Score record completeness so partial results are visible rather than silently treated as complete.
- Retry transient failures with a persisted queue and backoff.
- Recover interrupted jobs after a restart.
- Export collected results to CSV.

## Architecture

```text
Browser UI
   |
   v
FastAPI routes ------> Job / result / status APIs
   |                         |
   v                         v
Job runner ------------> SQLite
   |
   +----> Provider interface
             |
             +----> Mock provider (local development)
             |
             +----> Omkar adapter (configured integration)
   |
   v
Normalize -> Deduplicate -> Score completeness -> Export CSV
```

## Stack

| Layer | Choice |
|---|---|
| API | FastAPI |
| Persistence | SQLite |
| Job execution | Async runner with recovery and retry handling |
| Provider integration | Adapter interface, Omkar adapter, mock fallback |
| Frontend | Static single-page application |
| Output | CSV export |

## Run locally

Requires Python and the dependencies listed in `requirements.txt`.

```bash
git clone https://github.com/elnexi461-spec/Google-maps-scraper.git
cd Google-maps-scraper
python -m venv .venv
```

Activate the environment:

```bash
# macOS / Linux
source .venv/bin/activate

# Windows PowerShell
.venv\\Scripts\\Activate.ps1
```

Install dependencies and start the application:

```bash
pip install -r requirements.txt
python run.py
```

Open `http://localhost:8000` in your browser.

Without the `OMKAR_*` configuration, the application uses the mock provider. This is expected and should be clearly distinguishable from live provider output in the UI.

## Configure a real provider

The Omkar adapter reads its configuration from environment variables. The exact request shape depends on the installed extractor's API schema.

- Set the required `OMKAR_*` environment variables for your provider.
- Configure `OMKAR_API_PATH` for the provider's documented endpoint path.
- Review `app/providers/omkar.py` before connecting a new provider. The request template and response-envelope parsing are the adapter points.
- Do not paste credentials into source files or commit a populated `.env` file.

The adapter should be tested against documented provider responses and representative error cases before running large jobs.

## Reliability model

| Concern | Design |
|---|---|
| Duplicate records | Prefer provider ID; use a content-hash fallback |
| Partial records | Completeness score and incomplete-record flag |
| Transient provider failures | Retry with exponential backoff |
| Process restart | Persisted queue and recovery of interrupted jobs |
| Traceability | Store raw payloads before normalization |
| Portability | Provider adapter separates extraction from the job pipeline |

These are documented design goals; verify the current implementation and tests before relying on them for production workloads.

## Project layout

```text
app/
  config.py              Environment configuration and health snapshot
  db.py                  SQLite schema and persistence
  reliability.py         Deduplication, completeness, retries
  providers/
    base.py              Provider interface
    mock.py              Development provider
    omkar.py             Configurable provider adapter
  workers/
    runner.py            Job execution and recovery
  routes/                Job, result, and status endpoints
static/                  Browser UI
run.py                   Application entry point
```

## Before production use

This prototype should not be treated as a production data pipeline until its deployment and operational controls have been verified. In particular:

- Add automated tests for provider timeouts, malformed payloads, duplicate IDs, retry exhaustion, and crash recovery.
- Add authentication and authorization if the service is reachable by anyone other than its operator.
- Apply request limits, job limits, and export limits.
- Define retention and deletion rules for collected personal or business data.
- Keep secrets out of logs and API responses.
- Use only authorized sources and comply with applicable terms and data-protection requirements.

## Roadmap

- [ ] Document the full environment-variable reference.
- [ ] Add reproducible automated tests for the reliability paths.
- [ ] Add a sample provider fixture so adapter behavior can be tested offline.
- [ ] Add deployment instructions and a health-check example.
- [ ] Include a small, synthetic sample export for reviewers.

## License

Check the repository's license file for the terms that apply to this project.
