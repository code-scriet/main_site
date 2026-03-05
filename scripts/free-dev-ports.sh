#!/usr/bin/env bash

PORTS="5001,5002,5173,5174"
PIDS=$(lsof -ti tcp:$PORTS)

if [ -n "$PIDS" ]; then
  echo "Freeing occupied dev ports ($PORTS): $PIDS"
  kill -9 $PIDS
else
  echo "Dev ports already free ($PORTS)"
fi
