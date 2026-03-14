#!/bin/bash
# Azure App Service startup script for the FastAPI backend.
# Azure deploys the contents of backend/ to /home/site/wwwroot,
# so main.py and its siblings live at the root of wwwroot.

cd /home/site/wwwroot

# Create persistent data directory and override DATABASE_URL
mkdir -p /home/data
export DATABASE_URL="sqlite+aiosqlite:////home/data/scope_agent.db"

# Set up PYTHONPATH for zip-deployed dependencies
if [ -d ".python_packages/lib/site-packages" ]; then
    export PYTHONPATH="/home/site/wwwroot/.python_packages/lib/site-packages:$PYTHONPATH"
    export PATH="/home/site/wwwroot/.python_packages/lib/site-packages/bin:$PATH"
fi

# Azure sets PORT env var; default to 8000 if not set
PORT="${PORT:-8000}"

python -m gunicorn main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:$PORT" \
    --timeout 120
