#!/bin/bash
set -e

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SPECS_DIR="$SCRIPT_DIR/specs"
OUT_DIR="$SCRIPT_DIR/../packages/api-client/src"

mkdir -p "$SPECS_DIR" "$OUT_DIR"

echo "Fetching OpenAPI specs from $GATEWAY_URL ..."

# 先落临时文件、校验归一化通过后才覆盖 baseline。
# 不能写成 `curl ... > "$SPECS_DIR/$svc.json"`：shell 会在 exec curl 之前就以
# O_TRUNC 打开目标文件，服务没起来时原 baseline 当场被清空。详见
# docs/refactor/FRONTEND_MILESTONES.md §6。
services=("auth" "system" "note" "file" "ai" "notify")
failed=()

for svc in "${services[@]}"; do
  echo "  -> $svc"
  tmp="$(mktemp)"

  if ! curl -sf -m 30 "$GATEWAY_URL/$svc/v3/api-docs" -o "$tmp"; then
    echo "     [ERROR] 拉取失败（服务未就绪或网关路由缺失），保留原 baseline"
    failed+=("$svc")
  elif ! node "$SCRIPT_DIR/normalize-cli.mjs" "$svc" "$tmp" "$SPECS_DIR/$svc.json"; then
    echo "     [ERROR] 响应校验未通过，保留原 baseline"
    failed+=("$svc")
  fi

  rm -f "$tmp"
done

if [ ${#failed[@]} -gt 0 ]; then
  echo ""
  echo "以下服务未能更新：${failed[*]}"
  echo "对应 baseline 保持原样未被覆盖。修好后重跑本脚本。"
  exit 1
fi

echo "Generating TypeScript client ..."
for spec in "$SPECS_DIR"/*.json; do
  name=$(basename "$spec" .json)
  pnpm dlx openapi-typescript "$spec" --output "$OUT_DIR/$name.ts"
done

echo "Done. Generated files in $OUT_DIR"
