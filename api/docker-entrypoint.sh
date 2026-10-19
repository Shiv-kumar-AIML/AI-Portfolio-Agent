#!/bin/sh
set -e

echo "Running Prisma database migrations..."
npx prisma migrate deploy

echo "Starting Portfolio API..."
exec "$@"
