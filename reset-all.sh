#!/bin/bash
echo "=====Running database reset...====="

services=("estate-service" "contract-service" "chat-service" "notification-service")

for service in "${services[@]}"; do
  echo "=====Resetting $service...====="
  cd apps/$service
  npm run prisma:reset
  cd ../..
done

echo "=====Done Reset!====="