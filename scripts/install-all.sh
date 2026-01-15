#!/bin/bash
echo "=====Installing dependencies for all services...====="

services=("estate-service" "contract-service" "chat-service" "notification-service")

for service in "${services[@]}"; do
  echo "=====Installing $service...====="
  cd apps/$service && npm install && cd ../..
done

echo "=====Done dependencies!====="