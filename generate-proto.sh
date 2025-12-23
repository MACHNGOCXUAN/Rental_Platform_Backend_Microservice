#!/bin/bash
echo "=====Generating Protocol Buffers...====="

services=("user-service" "property-service")

for service in "${services[@]}"; do
  echo "=====Generating proto for $service...====="
  cd apps/$service && npm run proto:generate && cd ../..
done

echo "=====Done Protocol!====="