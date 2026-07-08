#!/usr/bin/env bash
# ─── dev.sh — starts Postgres + Redis via Docker, runs FastAPI locally ──────
set -e

echo "🐳  Starting Postgres + Redis…"
docker compose up db redis -d --wait

echo "🗄   Running migrations…"
source .venv/bin/activate
cd backend
alembic upgrade head

echo "🚀  Starting FastAPI on http://localhost:8000"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
