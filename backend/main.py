from __future__ import annotations

import sys
from pathlib import Path

# Ensure the backend package directory is on sys.path so that sibling imports
# (api, config, db, …) resolve whether uvicorn is launched from the project
# root  (`uvicorn backend.main:app`) or from inside backend/ (`uvicorn main:app`).
_backend_dir = str(Path(__file__).resolve().parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.routers import router
from api.service_router import router as service_router
from config import settings
from db import init_db

# In production (Azure), frontend dist is copied into backend/frontend_dist/
# In local dev, it may be at ../frontend/dist
_backend_root = Path(__file__).resolve().parent
FRONTEND_DIR = _backend_root / "frontend_dist"
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = _backend_root.parent / "frontend" / "dist"

app = FastAPI(title="Scope of Work Agent API", version="0.1.0")

origins = [origin.strip() for origin in settings.allow_origins.split(",") if origin]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    await init_db()


app.include_router(router)
app.include_router(service_router, prefix="/api/service")


# --- Serve Frontend (production only) ---
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIR / "index.html")


def run():
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()
