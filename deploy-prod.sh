#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$PROJECT_DIR"

echo "[1/5] Checking backend env file..."
if [ ! -f backend/.env ]; then
  echo "backend/.env not found. Creating from backend/.env.example"
  cp backend/.env.example backend/.env
  echo "Please edit backend/.env and add your secrets before re-running."
  exit 1
fi

echo "[2/5] Stopping existing containers..."
docker compose -f "$COMPOSE_FILE" down

echo "[3/5] Rebuilding and starting all services..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo "[4/5] Services started."

echo "[5/5] Service status:"
docker compose -f "$COMPOSE_FILE" ps

echo
echo "Frontend: http://137.184.201.76:3000"
echo "Backend:  http://137.184.201.76:8000"
echo "Health:   http://137.184.201.76:8000/health"
echo
echo "To follow logs:"
echo "docker compose -f $COMPOSE_FILE logs -f"
