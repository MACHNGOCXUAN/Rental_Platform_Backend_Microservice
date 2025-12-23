#!/bin/bash
echo "=====Installing dependencies for all services...====="

services=("user-service" "property-service")

for service in "${services[@]}"; do
  echo "=====Installing $service...====="
  cd apps/$service && npm install && cd ../..
done

echo "=====Done dependencies!====="