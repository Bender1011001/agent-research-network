#!/bin/sh
set -e

echo "🚀 Agent Research Network starting..."
echo "   Mode: $1"

# Wait for Postgres if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "⏳ Waiting for database..."
  until pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
    echo "   Database not ready, waiting..."
    sleep 2
  done
  echo "✅ Database ready"
fi

# Run migrations on boot
if [ "$RUN_MIGRATIONS" != "false" ]; then
  echo "📊 Running database migrations..."
  npm run db:migrate || {
    echo "❌ Migration failed"
    exit 1
  }
  echo "✅ Migrations complete"
fi

# Seed demo data if explicitly allowed
if [ "$ALLOW_DEMO_SEED" = "true" ]; then
  echo "🌱 Seeding demo data..."
  npx tsx scripts/seed-demo.ts || {
    echo "⚠️  Demo seed failed (continuing)"
  }
fi

echo "✅ Setup complete, starting services..."

# Start services based on mode
case "$1" in
  api)
    echo "🚀 Starting API server..."
    exec npm run start --workspace=@arn/api
    ;;
  web)
    echo "🚀 Starting Web server..."
    exec npm run start --workspace=@arn/web
    ;;
  all)
    echo "🚀 Starting all services..."
    exec /usr/local/bin/start-all.sh
    ;;
  *)
    echo "Usage: $0 {api|web|all}"
    exit 1
    ;;
esac
