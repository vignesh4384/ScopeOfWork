#!/bin/bash
# Azure App Service startup script for the FastAPI backend.
# Oryx may extract the app to a temp directory, so we stay in
# whatever working directory Oryx sets for us.

# Azure sets PORT env var; default to 8000 if not set
PORT="${PORT:-8000}"

python -m gunicorn main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:$PORT" \
    --timeout 120
