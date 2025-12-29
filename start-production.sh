#!/bin/bash

# Production start script for club_site
# This script runs both backend and frontend in production mode

set -e

echo "🚀 Starting Club Site in Production Mode..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and configure it properly."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check required environment variables
required_vars=("DATABASE_URL" "JWT_SECRET" "SUPER_ADMIN_EMAIL" "SUPER_ADMIN_PASSWORD")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    exit 1
fi

# Build the application
echo "📦 Building application..."
npm run build

# Start both servers
echo "🌐 Starting frontend and backend servers..."
echo "   Backend: ${BACKEND_URL:-http://localhost:5000}"
echo "   Frontend: ${FRONTEND_URL:-http://localhost:5173}"

# Run backend and frontend in parallel
NODE_ENV=production npm run start --workspace=apps/api &
BACKEND_PID=$!

NODE_ENV=production npm run preview --workspace=apps/web &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
