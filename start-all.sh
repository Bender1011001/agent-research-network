#!/bin/sh
set -e

# Start API in background
echo "🚀 Starting API server on port 3001..."
npm run start --workspace=@arn/api &
API_PID=$!

# Give API time to start
sleep 5

# Start Web in foreground
echo "🚀 Starting Web server on port 3000..."
exec npm run start --workspace=@arn/web
