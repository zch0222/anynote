"""运行中前端的部署冒烟；创建随机本地测试账号，结束撤销会话（账号保留）。不要对生产运行。

python3 infra/tests/smoke_web.py http://localhost:3000 --ws ws://localhost:1234
python3 infra/tests/smoke_web.py https://localhost:3443 --ws wss://localhost:3443/collab --local-test-tls
"""
import argparse
import base64
import concurrent.futures
import hashlib
from http.cookies import SimpleCookie
import json
import re
import secrets
import socket
import ssl
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument("origin")
parser.add_argument("--ws", required=True)
parser.add_argument("--local-test-tls", action="store_true")
args = parser.parse_args()
assert urlsplit(args.origin).hostname in {"localhost", "127.0.0.1"}, "仅允许本机测试环境"
assert urlsplit(args.ws).hostname in {"localhost", "127.0.0.1"}, "仅允许本机测试环境"
context = ssl._create_unverified_context() if args.local_test_tls else ssl.create_default_context()

def request(path, body=None, cookie="", origin=None):
    headers = {"Origin": origin or args.origin}
    if cookie:
        headers["Cookie"] = cookie
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(args.origin + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        response = urlopen(req, timeout=20, context=context)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()

status, _, html = request("/login")
assert status == 200
scripts = set(re.findall(r'src="([^" ]+\.js)"', html.decode()))
assert len(scripts) >= 3
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for path, result in zip(scripts, pool.map(request, scripts)):
        assert result[0] == 200, (path, result[0])
        assert "javascript" in result[1]["Content-Type"], path
print(f"PASS login + {len(scripts)} JavaScript assets")

status, _, payload = request("/api/auth/login", {"username": "containerMissingAccount", "password": "InvalidA1"})
assert status < 500 and json.loads(payload)["code"] != "00000"
assert json.loads(payload).get("msg")
status, _, _ = request("/api/auth/login", {"username": "probe", "password": "probe"}, origin="https://untrusted.example")
assert status == 403
print("PASS failed login message + Origin rejection")

status, headers, payload = request("/api/auth/register", {
    "username": "e2ed" + secrets.token_hex(4), "password": "ContainerA1",
    "nickname": "容器部署测试", "sex": 0,
})
assert status == 200 and json.loads(payload)["code"] == "00000", payload
cookie_jar = SimpleCookie()
for header in headers.get_all("Set-Cookie", []):
    cookie_jar.load(header)
for name in ["at", "rt"]:
    assert cookie_jar[name]["secure"] and cookie_jar[name]["httponly"]
cookie = "; ".join(f"{name}={cookie_jar[name].value}" for name in ["at", "rt"])
try:
    status, _, payload = request("/api/auth/me", cookie=cookie)
    assert status == 200 and json.loads(payload)["code"] == "00000", payload
    status, _, payload = request("/api/proxy/note/bases?page=1&pageSize=20&permissions=3", cookie=cookie)
    assert status == 200 and json.loads(payload)["code"] == "00000", payload
    print("PASS registration + Secure/httpOnly cookies + session + BFF JSON forwarding")
    status, _, payload = request("/api/auth/collab-token", {}, cookie=cookie)
    envelope = json.loads(payload)
    assert status == 200 and envelope["code"] == "00000", payload
    token = envelope["data"]["token"]
    endpoint = urlsplit(args.ws)
    key = base64.b64encode(secrets.token_bytes(16)).decode()
    connection = socket.create_connection((endpoint.hostname, endpoint.port or (443 if endpoint.scheme == "wss" else 80)), timeout=15)
    if endpoint.scheme == "wss":
        connection = context.wrap_socket(connection, server_hostname=endpoint.hostname)
    with connection:
        path = endpoint.path.rstrip("/") + "/index?token=" + quote(token)
        connection.sendall((f"GET {path} HTTP/1.1\r\nHost: {endpoint.netloc}\r\nOrigin: {args.origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        response = connection.recv(4096)
        assert response.startswith(b"HTTP/1.1 101"), response.split(b"\r\n", 1)[0]
        accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        assert accept in response
    print("PASS signed collab token + WebSocket 101 (proxy prefix / Origin preserved)")
finally:
    status, _, payload = request("/api/auth/logout", {}, cookie=cookie)
    assert status == 200 and json.loads(payload)["code"] == "00000"
    print("PASS logout; test session revoked")
