# run.py
import os, uvicorn
from dotenv import load_dotenv  # optional; falls back to real env vars
load_dotenv()
uvicorn.run("app.main:app", host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", "8000")), reload=False)
