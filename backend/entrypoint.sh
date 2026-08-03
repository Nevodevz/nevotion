#!/bin/sh
set -e

echo "[entrypoint] Waiting for database..."
# Simple wait loop for postgres
until python -c "
import psycopg2, os
psycopg2.connect(
    host=os.getenv('POSTGRES_HOST','db'),
    port=os.getenv('POSTGRES_PORT','5432'),
    user=os.getenv('POSTGRES_USER','nevodevs'),
    password=os.getenv('POSTGRES_PASSWORD','nevodevs_pass'),
    dbname=os.getenv('POSTGRES_DB','nevodevs'),
)
" 2>/dev/null; do
  echo "[entrypoint] DB not ready, retrying in 2s..."
  sleep 2
done
echo "[entrypoint] Database is up."

# Run Alembic migrations
echo "[entrypoint] Running migrations..."
alembic upgrade head

# Seed (idempotent — skips if data exists)
echo "[entrypoint] Seeding (idempotent)..."
python -m app.seed

# Start server
echo "[entrypoint] Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
