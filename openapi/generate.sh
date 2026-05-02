#!/bin/bash
set -e

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
SPECS_DIR="$(dirname "$0")/specs"
OUT_DIR="$(dirname "$0")/../packages/api-client/src"

mkdir -p "$SPECS_DIR" "$OUT_DIR"

echo "Fetching OpenAPI specs from $GATEWAY_URL ..."

services=("auth" "system" "note" "file" "ai" "notify")
for svc in "${services[@]}"; do
  echo "  -> $svc"
  curl -sf "$GATEWAY_URL/$svc/v3/api-docs" > "$SPECS_DIR/$svc.json" || {
    echo "  [WARN] $svc unavailable, skipping"
  }
done

echo "Generating TypeScript client ..."
for spec in "$SPECS_DIR"/*.json; do
  name=$(basename "$spec" .json)
  pnpm dlx openapi-typescript "$spec" --output "$OUT_DIR/$name.ts"
done

echo "Done. Generated files in $OUT_DIR"
