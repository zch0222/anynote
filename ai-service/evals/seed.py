"""按固定语料经网关公开接口创建评测数据：账号、知识库、成员、笔记与任务。

用法（在 compose 网络内执行）::

    python -m evals.seed --gateway http://anynote-gateway:8080 --output evals/output/seed.json

账号密码随机生成，只写入本地输出文件（已在 .gitignore 中忽略）。

@author 称霸幼儿园
"""

import argparse
import asyncio
import json
import secrets
import time
from pathlib import Path
from typing import Any

import httpx

from clients.knowledge import KnowledgeClient
from core.config import get_settings

DEFAULT_BASE_COVER = "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png"
TASK_DURATION_MS = 7 * 24 * 3600 * 1000


class GatewayError(RuntimeError):
    """网关返回非成功响应。

    @author 称霸幼儿园
    """


async def _call(client: httpx.AsyncClient, method: str, path: str, token: str | None = None,
                body: dict[str, Any] | None = None) -> Any:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = await client.request(method, path, json=body, headers=headers)
    try:
        envelope = response.json()
    except ValueError as error:
        raise GatewayError(f"{method} {path} HTTP {response.status_code}") from error
    if envelope.get("code") != "00000":
        raise GatewayError(f"{method} {path} {envelope.get('code')} {envelope.get('msg')}")
    return envelope.get("data")


async def login(client: httpx.AsyncClient, username: str, password: str) -> str:
    """登录并返回 accessToken。

    :param client: 指向网关的 HTTP 客户端
    :param username: 用户名
    :param password: 密码
    :return: accessToken
    """
    data = await _call(client, "POST", "/api/auth/login", body={"username": username, "password": password})
    return data["token"]["accessToken"]


async def seed(gateway: str, corpus_path: Path, output: Path) -> dict[str, Any]:
    """创建评测数据并写出种子文件。

    :param gateway: 网关地址
    :param corpus_path: 语料定义文件
    :param output: 输出文件
    :return: 种子内容
    """
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    knowledge = KnowledgeClient(get_settings())
    suffix = secrets.token_hex(4)
    personas: dict[str, dict[str, Any]] = {}
    refs: dict[str, str] = {}
    kb_ids: dict[str, int] = {}
    async with httpx.AsyncClient(base_url=gateway, timeout=30.0) as client:
        for name in corpus["personas"]:
            username = f"e{name[:3]}{suffix}"
            password = f"Aa1{secrets.token_hex(6)}"
            await _call(client, "POST", "/api/auth/register",
                        body={"username": username, "password": password, "nickname": f"M16.5评测{name}", "sex": 0})
            token = await login(client, username, password)
            scope = await knowledge.scope(token)
            personas[name] = {"username": username, "password": password, "userId": scope.user_id}
            personas[name]["token"] = token
        for base in corpus["knowledgeBases"]:
            owner = personas[base["owner"]]
            created = await _call(client, "POST", "/api/note/bases", owner["token"],
                                  {"name": base["name"], "detail": "", "cover": DEFAULT_BASE_COVER, "type": 0})
            kb_ids[base["key"]] = int(created["id"])
            refs[base["key"]] = f"kb:{created['id']}"
            for member in base["members"]:
                await _call(client, "POST", "/api/note/manage/bases/addUser", owner["token"],
                            {"knowledgeBaseId": created["id"], "userId": personas[member["persona"]]["userId"],
                             "permissions": member["permissions"]})
        for note in corpus["notes"]:
            author = personas[note["author"]]
            note_id = await _call(client, "POST", "/api/note/notes", author["token"],
                                  {"knowledgeBaseId": kb_ids[note["kb"]], "title": note["title"]})
            await _call(client, "PATCH", f"/api/note/notes/{note_id}", author["token"], {"content": note["content"]})
            refs[note["key"]] = f"note:{note_id}"
        now = int(time.time() * 1000)
        for task in corpus["tasks"]:
            owner = personas[task["owner"]]
            created = await _call(client, "POST", "/api/note/admin/noteTasks", owner["token"],
                                  {"taskName": task["name"], "taskDescribe": task["describe"],
                                   "knowledgeBaseId": kb_ids[task["kb"]], "startTime": now,
                                   "endTime": now + TASK_DURATION_MS})
            refs[task["key"]] = f"task:{created['id']}"
    for persona in personas.values():
        persona.pop("token", None)
    result = {"corpusVersion": corpus["version"], "personas": personas, "refs": refs, "kbIds": kb_ids}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> None:
    """命令行入口。"""
    parser = argparse.ArgumentParser(description="创建 M16.5 检索层评测语料")
    parser.add_argument("--gateway", default="http://anynote-gateway:8080")
    parser.add_argument("--corpus", default="evals/corpus_v1.json")
    parser.add_argument("--output", default="evals/output/seed.json")
    args = parser.parse_args()
    result = asyncio.run(seed(args.gateway, Path(args.corpus), Path(args.output)))
    print(json.dumps({"refs": result["refs"], "kbIds": result["kbIds"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
