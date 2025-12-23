#!/bin/bash
echo "=====Running database migrations...====="

services=("user-service" "property-service")

for service in "${services[@]}"; do
  echo "=====Migrating $service...====="
  cd apps/$service
  npm run prisma:generate
  npm run prisma:migrate
  cd ../..
done

echo "=====Done Migrate!====="