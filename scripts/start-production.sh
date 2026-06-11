#!/bin/sh
set -e

echo "[uc-smile-api] Starting in production mode..."
echo "[uc-smile-api] Database migrations are controlled by AUTO_RUN_MIGRATIONS"

export NODE_ENV=production
export LOG_LEVEL="${LOG_LEVEL:-error}"

exec npm run start:prod
