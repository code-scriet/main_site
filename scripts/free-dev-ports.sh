#!/usr/bin/env bash

set -euo pipefail

PORTS="5001,5002,5173,5174"
PIDS=$(lsof -ti tcp:$PORTS || true)

if [ -n "$PIDS" ]; then
  echo "Freeing occupied dev ports ($PORTS): $PIDS"
  kill -TERM $PIDS 2>/dev/null || true
  sleep 1

  REMAINING=$(lsof -ti tcp:$PORTS || true)
  if [ -n "$REMAINING" ]; then
    echo "Force killing remaining processes: $REMAINING"
    kill -9 $REMAINING 2>/dev/null || true
  fi

  for _ in {1..10}; do
    if ! lsof -ti tcp:$PORTS >/dev/null 2>&1; then
      echo "Dev ports are free ($PORTS)"
      exit 0
    fi
    sleep 1
  done

  echo "Warning: Some ports may still be closing, continuing startup"
else
  echo "Dev ports already free ($PORTS)"
fi
