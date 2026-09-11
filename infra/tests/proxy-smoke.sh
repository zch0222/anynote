#!/bin/sh
# 仅用于本机：生产前端镜像 + 临时 Nginx TLS/WSS 代理 + 现有开发后端。
# 先构建 anynote/anynote-web:prod-check，公开地址为 https://localhost:3443。
# Nginx 是本测试的临时工具，项目 Compose 不包含它。
set -eu
cd "$(dirname "$0")/../.."
root=$(pwd)
scratch=$(mktemp -d /tmp/anynote-proxy-check.XXXXXX)
web="anynote-web-check-$$"
collab="anynote-collab-check-$$"
proxy="anynote-proxy-check-$$"
cleanup() {
    docker rm -f "$proxy" "$collab" "$web" >/dev/null 2>&1 || true
    case "$scratch" in /tmp/anynote-proxy-check.*) rm -rf -- "$scratch" ;; esac
}
trap cleanup EXIT INT TERM

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
    -addext subjectAltName=DNS:localhost -keyout "$scratch/privkey.pem" -out "$scratch/fullchain.pem" >/dev/null 2>&1
python3 - "$root" "$scratch" "$web" "$collab" <<'PY'
from pathlib import Path
import sys
root, scratch = map(Path, sys.argv[1:3])
web, collab = sys.argv[3:5]
text = (root / "infra/nginx/nginx.conf").read_text()
for before, after in {
    "YOUR_DOMAIN": "localhost", "/path/to/cert": "/certs",
    "127.0.0.1:3000": f"{web}:3000", "127.0.0.1:1234": f"{collab}:1234",
}.items():
    text = text.replace(before, after)
(scratch / "anynote.conf").write_text(text)
PY

docker run --rm -d --name "$web" --network "${ANYNOTE_TEST_NETWORK:-anynote_anynote-net}" \
    -p 127.0.0.1:3101:3000 --init --cap-drop ALL --security-opt no-new-privileges:true \
    -e DEPLOYMENT_ENV=production -e INTERNAL_API_URL=http://anynote-gateway:8080 \
    -e NEXT_PUBLIC_APP_URL=https://localhost:3443 -e NEXT_PUBLIC_COLLAB_WS_URL=wss://localhost:3443/collab \
    -e COLLAB_TOKEN_SECRET=local-proxy-test-secret-32-characters anynote/anynote-web:prod-check >/dev/null
docker run --rm -d --name "$collab" --network "${ANYNOTE_TEST_NETWORK:-anynote_anynote-net}" \
    -e COLLAB_ALLOWED_ORIGINS=https://localhost:3443 -e COLLAB_PERSISTENCE_DIR= \
    -e COLLAB_TOKEN_SECRET=local-proxy-test-secret-32-characters anynote/anynote-collab:local >/dev/null
docker run --rm --network "${ANYNOTE_TEST_NETWORK:-anynote_anynote-net}" --entrypoint nginx \
    -v "$scratch/anynote.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$root/infra/nginx/snippets:/etc/nginx/snippets:ro" -v "$scratch:/certs:ro" nginx:1.28-alpine -t
docker run --rm -d --name "$proxy" --network "${ANYNOTE_TEST_NETWORK:-anynote_anynote-net}" -p 127.0.0.1:3443:443 \
    -v "$scratch/anynote.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$root/infra/nginx/snippets:/etc/nginx/snippets:ro" -v "$scratch:/certs:ro" nginx:1.28-alpine >/dev/null
curl --retry 10 --retry-delay 1 --retry-all-errors -kfsS https://localhost:3443/login -o /dev/null
python3 infra/tests/smoke_web.py https://localhost:3443 --ws wss://localhost:3443/collab --local-test-tls
