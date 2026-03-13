from __future__ import annotations

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routers import router
from .config import settings
from .db import init_db

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


def run():
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()
