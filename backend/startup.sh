#!/bin/bash
# Azure App Service startup script for the FastAPI backend.
# Azure deploys the contents of backend/ to /home/site/wwwroot,
# so main.py and its siblings live at the root of wwwroot.

cd /home/site/wwwroot

# Install dependencies if .python_packages exists (zip deploy)
if [ -d ".python_packages" ]; then
    export PYTHONPATH="/home/site/wwwroot/.python_packages/lib/site-packages:$PYTHONPATH"
fi

gunicorn main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 120
