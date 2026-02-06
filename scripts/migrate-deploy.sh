#!/bin/bash
set -e

echo "🔄 Running database migrations..."

# Set connection pool timeout for migrations
export PRISMA_CLIENT_ENGINE_TYPE="binary"

# Retry logic for migration
MAX_RETRIES=3
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  echo "📊 Migration attempt $((RETRY_COUNT + 1))/$MAX_RETRIES"
  
  if npx prisma migrate deploy --schema=./prisma/schema.prisma; then
    echo "✅ Migrations applied successfully"
    exit 0
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "⚠️  Migration failed, retrying in 5 seconds..."
      sleep 5
    fi
  fi
done

echo "❌ Migration failed after $MAX_RETRIES attempts"
exit 1
