#!/usr/bin/env bash
# One-command local run: cognee sidecar (venv) + Next.js dev server.
# Usage: npm run dev:all        (sidecar on :8000, app on :3000)
set -euo pipefail
cd "$(dirname "$0")/.."

PY=${PYTHON:-}
if [ -z "$PY" ]; then
  for c in python3.12 python3.13 python3.11 python3.10 python3.14 python3; do
    if command -v "$c" >/dev/null && "$c" -c 'import sys; exit(not ((3,10) <= sys.version_info[:2] < (3,15)))'; then PY=$c; break; fi
  done
fi
[ -n "$PY" ] || { echo "cognee needs Python 3.10-3.14"; exit 1; }

if [ ! -x sidecar/.venv/bin/uvicorn ]; then
  "$PY" -m venv sidecar/.venv
  sidecar/.venv/bin/pip install -q --upgrade pip
  sidecar/.venv/bin/pip install -r sidecar/requirements.txt
fi

[ -f .env.local ] || cp .env.example .env.local
set -a; . ./.env.local; set +a

(cd sidecar && SYSTEM_ROOT_DIRECTORY="$PWD/.cognee_system" DATA_ROOT_DIRECTORY="$PWD/.data_storage" \
  .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000) &
SIDECAR_PID=$!
trap 'kill $SIDECAR_PID 2>/dev/null || true' EXIT

npx next dev
