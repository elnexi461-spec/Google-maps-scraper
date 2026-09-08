import csv, io, json
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..db import get_conn

router = APIRouter()

SORTABLE = {"name", "rating", "reviews_count", "completeness_score", "created_at"}


@router.get("/jobs/{job_id}/results")
def list_results(job_id: int, request: Request, q: str = "", completeness: str = "all",
                 has_phone: str = "", min_rating: float = 0, sort: str = "created_at",
                 order: str = "desc", page: int = 1, page_size: int = 25):
    s = request.app.state.settings
    where, params = ["job_id = ?"], [job_id]
    if q:
        where.append("(name LIKE ? OR phone LIKE ? OR address LIKE ? OR website LIKE ?)")
        like = f"%{q}%"; params += [like] * 4
    if completeness == "clean":
        where.append("is_incomplete = 0")
    elif completeness == "incomplete":
        where.append("is_incomplete = 1")
    if has_phone == "yes":
        where.append("phone IS NOT NULL AND phone != ''")
    elif has_phone == "no":
        where.append("(phone IS NULL OR phone = '')")
    if min_rating:
        where.append("rating >= ?"); params.append(min_rating)
    clause = "WHERE " + " AND ".join(where)
    sort = sort if sort in SORTABLE else "created_at"
    order = "ASC" if order.lower() == "asc" else "DESC"
    with get_conn(s.database_path) as conn:
        if not conn.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone():
            raise HTTPException(404, "job not found")
        total = conn.execute(f"SELECT COUNT(*) AS c FROM results {clause}", params).fetchone()["c"]
        rows = conn.execute(
            f"""SELECT id, kgmid, name, phone, website, email, rating, reviews_count, address,
                category, google_maps_url, completeness_score, is_incomplete, missing_fields, created_at
                FROM results {clause} ORDER BY {sort} {order} LIMIT ? OFFSET ?""",
            params + [page_size, (page - 1) * page_size]).fetchall()
    results = [dict(r) for r in rows]
    for r in results:
        r["missing_fields"] = json.loads(r["missing_fields"])
    return {"total": total, "page": page, "page_size": page_size, "results": results}


@router.get("/jobs/{job_id}/export.csv")
def export_csv(job_id: int, request: Request, completeness: str = "all"):
    s = request.app.state.settings
    where, params = "WHERE job_id = ?", [job_id]
    if completeness == "clean":
        where += " AND is_incomplete = 0"
    elif completeness == "incomplete":
        where += " AND is_incomplete = 1"
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "phone", "email", "website", "rating", "reviews_count",
                "address", "category", "kgmid", "google_maps_url",
                "completeness_score", "incomplete", "missing_fields"])
    with get_conn(s.database_path) as conn:
        rows = conn.execute(
            f"SELECT * FROM results {where} ORDER BY completeness_score DESC", params).fetchall()
        for r in rows:
            w.writerow([r["name"], r["phone"], r["email"], r["website"], r["rating"],
                        r["reviews_count"], r["address"], r["category"], r["kgmid"],
                        r["google_maps_url"], r["completeness_score"], r["is_incomplete"],
                        json.loads(r["missing_fields"])])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=job-{job_id}-results.csv"})
