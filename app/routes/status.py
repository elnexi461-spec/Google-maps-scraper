from fastapi import APIRouter, Request

from ..db import get_conn

router = APIRouter()


@router.get("/status")
def integration_status(request: Request):
    """Integration health. Never returns secret values."""
    s = request.app.state.settings
    try:
        with get_conn(s.database_path) as conn:
            db_ok = conn.execute("SELECT 1").fetchone() is not None
            counts = {
                "jobs": conn.execute("SELECT COUNT(*) c FROM jobs").fetchone()["c"],
                "results": conn.execute("SELECT COUNT(*) c FROM results").fetchone()["c"],
                "raw_records": conn.execute("SELECT COUNT(*) c FROM raw_records").fetchone()["c"],
                "retry_pending": conn.execute(
                    "SELECT COUNT(*) c FROM retry_queue WHERE status='pending'").fetchone()["c"],
                "retry_exhausted": conn.execute(
                    "SELECT COUNT(*) c FROM retry_queue WHERE status='exhausted'").fetchone()["c"],
                "errors": conn.execute("SELECT COUNT(*) c FROM error_log").fetchone()["c"],
            }
    except Exception as exc:
        return {"ok": False, "database": "error", "detail": str(exc),
                "config": s.status_dict(), "counts": {}}
    return {"ok": True, "database": "ok", "config": s.status_dict(), "counts": counts}
  
