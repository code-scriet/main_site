#!/bin/bash

# Quick Start Script for Playground Development

echo "🚀 Starting Code Scriet Playground..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Function to check if port is in use
check_port() {
    lsof -ti:$1 > /dev/null 2>&1
    return $?
}

# Kill existing processes if running
if check_port 5002; then
    echo "🔄 Stopping existing execution server on port 5002..."
    lsof -ti:5002 | xargs kill -9 2>/dev/null
    sleep 1
fi

if check_port 5174; then
    echo "🔄 Stopping existing playground on port 5174..."
    lsof -ti:5174 | xargs kill -9 2>/dev/null
    sleep 1
fi

echo "✅ Ports cleared"
echo ""

# Start both services
echo "🎯 Starting services..."
echo "  • Execution Server → http://localhost:5002"
echo "  • Playground → http://localhost:5174"
echo ""

# Start execution server in background
node execute-server.js &
EXEC_PID=$!

# Wait a bit for server to start
sleep 2

# Check if execution server started successfully
if ! check_port 5002; then
    echo "❌ Failed to start execution server"
    exit 1
fi

echo "✅ Execution server running (PID: $EXEC_PID)"

# Start Vite dev server
npm run dev &
VITE_PID=$!

echo "✅ Playground frontend starting (PID: $VITE_PID)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Playground is ready!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Open in browser: http://localhost:5174"
echo ""
echo "To stop all services:"
echo "  lsof -ti:5002 | xargs kill -9"
echo "  lsof -ti:5174 | xargs kill -9"
echo ""
echo "Or press Ctrl+C to stop"
echo ""

# Wait for user interrupt
trap "echo ''; echo '🛑 Stopping services...'; kill $EXEC_PID $VITE_PID 2>/dev/null; echo '✅ Stopped'; exit 0" INT TERM

# Keep script running
wait
