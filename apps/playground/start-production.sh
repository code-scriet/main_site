#!/bin/bash

# Production start script for Playground Execution Server
# This script is used by Render.com deployment

echo "🚀 Starting Code Execution Server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Set port (Render uses PORT env variable, fallback to 10000)
export EXECUTE_PORT=${PORT:-10000}

echo "📍 Port: $EXECUTE_PORT"
echo "🌍 Environment: ${NODE_ENV:-production}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start the server
node execute-server.js
