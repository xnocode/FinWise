#!/bin/sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

pids=""

cleanup() {
    echo ""
    echo "🛑 Shutting down all services..."
    
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            service_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo "   Stopping process $pid ($service_name)..."
            kill -TERM "$pid" 2>/dev/null
        fi
    done
    
    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            timeout=4
            while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            if kill -0 "$pid" 2>/dev/null; then
                echo "   Force stopping process $pid..."
                kill -KILL "$pid" 2>/dev/null
            fi
        fi
    done
    
    echo "✅ All services stopped"
    exit 0
}

echo "🚀 Starting all services..."
echo ""

cd "$BUILD_DIR" || exit 1

ls -lah

DEFAULT_PACKAGED_DB_PATH="/app/db/custom.db"
DEFAULT_PACKAGED_DATABASE_URL="file:$DEFAULT_PACKAGED_DB_PATH"

if [ -d "/app/python-runtime/site-packages" ]; then
    export PYTHONPATH="/app/python-runtime/site-packages:/app/next-service-dist${PYTHONPATH:+:$PYTHONPATH}"
    export PATH="/app/python-runtime/site-packages/bin:$PATH"
    export PYTHONDONTWRITEBYTECODE=1
    export PYTHONUNBUFFERED=1
    echo "🐍 Python runtime enabled in deployment: $(python --version 2>&1)"
fi

if [ -f "./next-service-dist/server.js" ]; then
    echo "🚀 Starting Next.js server..."
    cd next-service-dist/ || exit 1
    
    export NODE_ENV=production
    export PORT="${PORT:-3000}"
    export HOSTNAME="${HOSTNAME:-0.0.0.0}"
    export DATABASE_URL="${DATABASE_URL:-$DEFAULT_PACKAGED_DATABASE_URL}"

    if [ "$DATABASE_URL" = "$DEFAULT_PACKAGED_DATABASE_URL" ]; then
        if [ ! -f "$DEFAULT_PACKAGED_DB_PATH" ]; then
            echo "❌ Packaged database file $DEFAULT_PACKAGED_DB_PATH not found"
            echo "   Startup aborted to avoid starting with an empty database"
            exit 1
        fi

        echo "🗄️  Using packaged database: $DEFAULT_PACKAGED_DB_PATH"
    else
        echo "🗄️  Using external database: $DATABASE_URL"
    fi
    
    bun server.js &
    NEXT_PID=$!
    pids="$NEXT_PID"
    
    sleep 1
    if ! kill -0 "$NEXT_PID" 2>/dev/null; then
        echo "❌ Next.js server failed to start"
        exit 1
    else
        echo "✅ Next.js server started (PID: $NEXT_PID, Port: $PORT)"
    fi
    
    cd ../
else
    echo "⚠️  Next.js server file not found: ./next-service-dist/server.js"
fi

if [ -f "./mini-services-start.sh" ]; then
    echo "🚀 Starting mini-services..."
    
    sh ./mini-services-start.sh &
    MINI_PID=$!
    pids="$pids $MINI_PID"
    
    sleep 1
    if ! kill -0 "$MINI_PID" 2>/dev/null; then
        echo "⚠️  mini-services might have failed to start, continuing..."
    else
        echo "✅ mini-services started (PID: $MINI_PID)"
    fi
elif [ -d "./mini-services-dist" ]; then
    echo "⚠️  mini-services start script not found, but directory exists"
else
    echo "ℹ️  mini-services directory does not exist, skipping"
fi

echo "🚀 Starting Caddy..."
echo "✅ Caddy started"
echo ""
echo "🎉 All services started!"
echo ""
echo "💡 Press Ctrl+C to stop all services"
echo ""

exec caddy run --config Caddyfile --adapter caddyfile
