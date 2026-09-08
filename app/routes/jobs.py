import json
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..db import get_conn, now

router = APIRouter()

ALLOWED_FILTERS = {"min_rating", "max_results", "has_website", "has_phone"}


class JobCreate(BaseModel):
    niche: str = Field(min_length=2, max_length=200)
    location: str = Field(min_length=2, max_length=200)
    keywords: str = ""
    filters: dict = {}


def _row_to_dict(r):
    d = dict(r)
    d["filters"] = json.loads(d.pop("filters_json") or "{}")
    return d


@router.post("/jobs", status_code=201)
async def create_job(payload: JobCreate, request: Request):
    filters = {k: v for k, v in payload.filters.items() if k in ALLOWED_FILTERS}
    s = request.app.state.settings
    with get_conn(s.database_path) as conn:
        cur = conn.execute(
            "INSERT INTO jobs (niche, location, keywords, filters_json, created_at) VALUES (?,?,?,?,?)",
            (payload.niche.strip(), payload.location.strip(), payload.keywords.strip(),
             json.dumps(filters), now()),
        )
        job_id = cur.lastrowid
    await request.app.state.runner.schedule(job_id)
    return {"id": job_id, "status": "queued"}


@router.get("/jobs")
def list_jobs(status: str = "", q: str = "", page: int = 1, page_size: int = 20, request: Request = None):
    s = request.app.state.settings
    where, params = [], []
    if status:
        where.append("status = ?"); params.append(status)
    if q:
        where.append("(niche LIKE ? OR location LIKE ?)"); params += [f"%{q}%", f"%{q}%"]
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    with get_conn(s.database_path) as conn:
        total = conn.execute(f"SELECT COUNT(*) AS c FROM jobs {clause}", params).fetchone()["c"]
        rows = conn.execute(
            f"SELECT * FROM jobs {clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [page_size, (page - 1) * page_size]).fetchall()
    return {"total": total, "page": page, "page_size": page_size,
            "jobs": [_row_to_dict(r) for r in rows]}


@router.get("/jobs/{job_id}")
def get_job(job_id: int, request: Request):
    s = request.app.state.settings
    with get_conn(s.database_path) as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, "job not found")
        errors = conn.execute(
            "SELECT id, level, source, message, created_at FROM error_log WHERE job_id=? ORDER BY created_at DESC LIMIT 50",
            (job_id,)).fetchall()
    d = _row_to_dict(row)
    d["errors"] = [dict(e) for e in errors]
    return d


@router.post("/jobs/{job_id}/resume")
async def resume_job(job_id: int, request: Request):
    s = request.app.state.settings
    with get_conn(s.database_path) as conn:
        row = conn.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, "job not found")
        if row["status"] not in ("failed", "partial"):
            raise HTTPException(409, f"job status '{row['status']}' cannot be resumed")
        conn.execute("UPDATE jobs SET status='queued', error=NULL WHERE id=?", (job_id,))
    await request.app.state.runner.schedule(job_id)
    return {"id": job_id, "status": "queued"}
