import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import init_db
from .routes import jobs, results, status
from .workers.runner import JobRunner

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app):
    settings = get_settings()
    init_db(settings.database_path)
    runner = JobRunner(settings)
    app.state.settings = settings
    app.state.runner = runner
    await runner.start()
    yield


app = FastAPI(title="LeadForge — Google Maps Lead Generation", lifespan=lifespan)
app.include_router(jobs.router, prefix="/api")
app.include_router(results.router, prefix="/api")
app.include_router(status.router, prefix="/api")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    return FileResponse("static/index.html")
