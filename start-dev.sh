#!/usr/bin/env bash
# Inicia API (8001) y React (5173). Uso: ./start-dev.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "Iniciando API en http://127.0.0.1:8001 ..."
python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8001 &
UV_PID=$!

cleanup() {
  kill "$UV_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Iniciando Vite en http://127.0.0.1:5173 ..."
cd web
exec npm run dev
