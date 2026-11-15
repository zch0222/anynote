"""固定九类索引验收的资源补种、隔离与精确清理辅助。

@author 称霸幼儿园
"""

import hashlib
import json
import os
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import urlparse

import pymysql
from minio import Minio
from minio.error import S3Error
from pymysql.cursors import DictCursor

from indexing.models import ALL_ENTITY_TYPES, SourceDocument


def _entity_id(manifest, key: str) -> int:
    """从清单引用中解析基础实体主键。"""
    return int(manifest.refs[key].split(":", 1)[1].split("#", 1)[0])


def _ids(manifest, key: str) -> list[int]:
    """读取清单中指定表的主键列表。"""
    return [int(value) for value in manifest.row_ids.get(key, [])]


def _placeholders(values: list[Any]) -> str:
    """为非空参数列表生成 SQL 占位符。"""
    if not values:
        raise ValueError
    return ",".join("%s" for _value in values)


def _delete_ids(table: str, ids: list[int], suffix: str = "", params: tuple[Any, ...] = ()) -> tuple[str, tuple[Any, ...]]:
    """生成按主键及附加归属条件删除的参数化语句。"""
    if not ids:
        raise ValueError
    return (
        f"DELETE FROM {table} WHERE id IN ({_placeholders(ids)}){suffix}",
        (*ids, *params),
    )


def build_cleanup_plan(manifest) -> list[tuple[str, tuple[Any, ...]]]:
    """按清单资源主键和归属生成参数化物理清理语句。"""
    note_id = _entity_id(manifest, "note")
    mooc_id = int(manifest.mooc_id or 0)
    kb_id = int(manifest.kb_id or 0)
    user_id = int(manifest.user_id or 0)
    task_id = _entity_id(manifest, "task")
    notice_id = _entity_id(manifest, "notice")
    mooc_item_ids = sorted({
        _entity_id(manifest, key) for key in ("mooc_item", "video") if key in manifest.refs
    })
    doc_ids = sorted(_ids(manifest, "n_doc"))
    if not all((note_id, mooc_id, kb_id, user_id, task_id, notice_id)) or not mooc_item_ids or not doc_ids:
        raise ValueError

    plan: list[tuple[str, tuple[Any, ...]]] = []
    for table in ("n_note_edit_log", "n_note_history", "n_note_operation_log"):
        plan.append(_delete_ids(table, _ids(manifest, table)))
    plan.append(_delete_ids("n_note_text", _ids(manifest, "n_note_text"), " AND create_by=%s", (user_id,)))
    plan.append(_delete_ids("n_doc", doc_ids, " AND knowledge_base_id=%s AND create_by=%s", (kb_id, user_id)))
    plan.append(_delete_ids("f_file", [int(value) for value in manifest.file_ids], " AND create_by=%s", (user_id,)))
    plan.append((
        "DELETE FROM n_note WHERE id=%s AND knowledge_base_id=%s AND create_by=%s",
        (note_id, kb_id, user_id),
    ))
    plan.append(_delete_ids(
        "a_mooc_video_summarize", _ids(manifest, "a_mooc_video_summarize"),
        " AND mooc_id=%s AND create_by=%s", (mooc_id, user_id),
    ))
    plan.append(_delete_ids(
        "n_mooc_video_item_info", _ids(manifest, "n_mooc_video_item_info"),
        " AND mooc_id=%s AND create_by=%s", (mooc_id, user_id),
    ))
    plan.append(_delete_ids("n_mooc_item_text", _ids(manifest, "n_mooc_item_text"), " AND create_by=%s", (user_id,)))
    plan.append((
        f"DELETE FROM n_mooc_item WHERE id IN ({_placeholders(mooc_item_ids)}) AND mooc_id=%s AND create_by=%s",
        (*mooc_item_ids, mooc_id, user_id),
    ))
    plan.append((
        "DELETE FROM n_mooc WHERE id=%s AND knowledge_base_id=%s AND create_by=%s",
        (mooc_id, kb_id, user_id),
    ))
    plan.append(_delete_ids(
        "n_note_task_operation_history", _ids(manifest, "n_note_task_operation_history"),
        " AND operator_id=%s", (user_id,),
    ))
    plan.append(("DELETE FROM n_user_note_task WHERE note_task_id=%s AND user_id=%s", (task_id, user_id)))
    plan.append((
        "DELETE FROM n_note_task WHERE id=%s AND knowledge_base_id=%s AND create_by=%s",
        (task_id, kb_id, user_id),
    ))
    plan.append(("DELETE FROM ntc_user_notice WHERE notice_id=%s AND user_id=%s", (notice_id, user_id)))
    plan.append((
        "DELETE FROM ntc_knowledge_base_notice WHERE notice_id=%s AND knowledge_base_id=%s",
        (notice_id, kb_id),
    ))
    plan.append(("DELETE FROM ntc_notice WHERE id=%s", (notice_id,)))
    plan.append(_delete_ids("n_knowledge_change", _ids(manifest, "n_knowledge_change")))
    plan.append((
        "DELETE FROM n_user_knowledge_base WHERE knowledge_base_id=%s AND user_id=%s",
        (kb_id, user_id),
    ))
    plan.append(("DELETE FROM n_knowledge_base WHERE id=%s AND create_by=%s", (kb_id, user_id)))
    plan.append(("DELETE FROM sys_user_role WHERE user_id=%s", (user_id,)))
    plan.append(("DELETE FROM sys_user WHERE id=%s AND username=%s", (user_id, manifest.username)))
    return plan


def cleanup_verified(result: dict[str, Any]) -> bool:
    """检查数据库、对象、令牌、旧索引和隔离索引是否全部清零。"""
    return (
        not result.get("database")
        and not result.get("objects")
        and not result.get("tokens")
        and not result.get("legacy")
        and result.get("indices") == 0
    )


def legacy_document_owned(source: dict[str, Any], manifest, entity_id: int) -> bool:
    """判断共享旧索引文档是否同时匹配本轮 ID、知识库、创建者和前缀。"""
    title = str(source.get("title") or "")
    return (
        int(source.get("id") or 0) == entity_id
        and int(source.get("knowledgeBaseId") or 0) == manifest.kb_id
        and int(source.get("createBy") or 0) == manifest.user_id
        and title.startswith(manifest.prefix)
    )


def validate_fixture_object_names(object_names: list[str], prefix: str) -> None:
    """校验对象路径为包含本次前缀的相对路径。"""
    for object_name in object_names:
        path = PurePosixPath(object_name)
        if not object_name or path.is_absolute() or ".." in path.parts or prefix not in path.name:
            raise ValueError


class FixtureDatabase:
    """使用短事务补种并物理清理固定验收资源。

    @author 称霸幼儿园
    """

    def __init__(self, connection_factory=None):
        """注入可选连接工厂，生产验收默认读取本机 Docker 环境。"""
        self._connection_factory = connection_factory or self._connect

    @staticmethod
    def _connect():
        """创建使用 UTF-8 和字典结果的 MySQL 事务连接。"""
        return pymysql.connect(
            host=os.getenv("MYSQL_HOST", "mysql"),
            port=int(os.getenv("MYSQL_PORT", "3306")),
            user=os.getenv("MYSQL_ROOT_USER", "root"),
            password=os.environ["MYSQL_ROOT_PASSWORD"],
            database=os.getenv("MYSQL_DATABASE", "anynote"),
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=False,
        )

    @staticmethod
    def _close(connection) -> None:
        """关闭真实连接，兼容不提供 close 的测试替身。"""
        close = getattr(connection, "close", None)
        if callable(close):
            close()

    def supplement_video(self, manifest, object_name: str, summary: str) -> None:
        """更新本轮视频字幕并插入固定总结，记录新增数据库行 ID。"""
        item_id = _entity_id(manifest, "video")
        connection = self._connection_factory()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT mi.id, mi.mooc_id FROM n_mooc_item mi "
                    "JOIN n_mooc m ON m.id=mi.mooc_id "
                    "WHERE mi.id=%s AND mi.mooc_id=%s AND m.knowledge_base_id=%s "
                    "AND m.create_by=%s AND mi.is_delete=0 AND m.is_delete=0",
                    (item_id, manifest.mooc_id, manifest.kb_id, manifest.user_id),
                )
                if cursor.fetchone() is None:
                    raise ValueError
                updated = cursor.execute(
                    "UPDATE n_mooc_video_item_info SET srt_object_name=%s, update_by=%s, update_time=NOW() "
                    "WHERE mooc_item_id=%s AND mooc_id=%s AND create_by=%s AND is_delete=0",
                    (object_name, manifest.user_id, item_id, manifest.mooc_id, manifest.user_id),
                )
                if updated != 1:
                    raise ValueError
                cursor.execute(
                    "SELECT id FROM n_mooc_video_item_info WHERE mooc_item_id=%s AND mooc_id=%s AND create_by=%s",
                    (item_id, manifest.mooc_id, manifest.user_id),
                )
                info = cursor.fetchone()
                if info is None:
                    raise ValueError
                cursor.execute(
                    "INSERT INTO a_mooc_video_summarize "
                    "(mooc_id,mooc_item_id,content,model,is_delete,create_by,update_by,remark) "
                    "VALUES (%s,%s,%s,%s,0,%s,%s,%s)",
                    (
                        manifest.mooc_id, item_id, summary, "m164-deterministic-fixture",
                        manifest.user_id, manifest.user_id, manifest.prefix,
                    ),
                )
                manifest.row_ids["n_mooc_video_item_info"] = [int(info["id"])]
                manifest.row_ids["a_mooc_video_summarize"] = [int(cursor.lastrowid)]
                manifest.refs["transcript"] = f"mooc_item:{item_id}#transcript"
                manifest.refs["summary"] = f"mooc_item:{item_id}#summary"
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            self._close(connection)

    @staticmethod
    def _select_ids(cursor, table: str, where: str, params: tuple[Any, ...]) -> list[int]:
        """按已限定的归属条件读取数据库主键。"""
        cursor.execute(f"SELECT id FROM {table} WHERE {where}", params)
        return [int(row["id"]) for row in cursor.fetchall()]

    def doc_statuses(self, manifest) -> dict[int, int]:
        """读取本轮资料的真实索引状态。"""
        doc_ids = sorted({_entity_id(manifest, key) for key in manifest.refs if key.startswith("doc_")})
        connection = self._connection_factory()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT id,index_status FROM n_doc WHERE id IN ({_placeholders(doc_ids)}) "
                    "AND knowledge_base_id=%s AND create_by=%s",
                    (*doc_ids, manifest.kb_id, manifest.user_id),
                )
                return {int(row["id"]): int(row["index_status"]) for row in cursor.fetchall()}
        finally:
            self._close(connection)

    def collect_resource_ids(self, manifest) -> None:
        """从权威数据库读取清关联主键，避免按名称模糊删除。"""
        note_id = _entity_id(manifest, "note")
        doc_ids = sorted({_entity_id(manifest, key) for key in manifest.refs if key.startswith("doc_")})
        item_ids = sorted({_entity_id(manifest, key) for key in ("mooc_item", "video")})
        task_id = _entity_id(manifest, "task")
        connection = self._connection_factory()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT note_text_id FROM n_note WHERE id=%s AND knowledge_base_id=%s AND create_by=%s",
                    (note_id, manifest.kb_id, manifest.user_id),
                )
                note = cursor.fetchone()
                if note is None:
                    raise ValueError
                manifest.row_ids["n_note_text"] = [int(note["note_text_id"])]
                operation_ids = self._select_ids(
                    cursor, "n_note_operation_log", "note_id=%s AND operator_id=%s", (note_id, manifest.user_id),
                )
                manifest.row_ids["n_note_operation_log"] = operation_ids
                manifest.row_ids["n_note_history"] = self._select_ids(
                    cursor, "n_note_history", "note_id=%s", (note_id,),
                )
                manifest.row_ids["n_note_edit_log"] = (
                    self._select_ids(cursor, "n_note_edit_log", f"operation_id IN ({_placeholders(operation_ids)})", tuple(operation_ids))
                    if operation_ids else []
                )
                cursor.execute(
                    f"SELECT id,file_id FROM n_doc WHERE id IN ({_placeholders(doc_ids)}) "
                    "AND knowledge_base_id=%s AND create_by=%s",
                    (*doc_ids, manifest.kb_id, manifest.user_id),
                )
                docs = cursor.fetchall()
                manifest.row_ids["n_doc"] = sorted(int(row["id"]) for row in docs)
                file_ids = {int(row["file_id"]) for row in docs}
                file_ids.update(int(value) for value in manifest.file_ids)
                cursor.execute(
                    f"SELECT id FROM f_file WHERE id IN ({_placeholders(sorted(file_ids))}) AND create_by=%s",
                    (*sorted(file_ids), manifest.user_id),
                )
                manifest.file_ids = sorted(int(row["id"]) for row in cursor.fetchall())
                manifest.row_ids["n_mooc_item_text"] = self._select_ids(
                    cursor, "n_mooc_item_text", f"mooc_item_id IN ({_placeholders(item_ids)}) AND create_by=%s",
                    (*item_ids, manifest.user_id),
                )
                manifest.row_ids["n_note_task_operation_history"] = self._select_ids(
                    cursor, "n_note_task_operation_history", "note_task_id=%s AND operator_id=%s",
                    (task_id, manifest.user_id),
                )
                pairs = sorted({
                    (document_type, _entity_id(manifest, key))
                    for key in manifest.refs
                    for document_type in [key if key in {"kb", "note", "mooc", "task", "notice"} else (
                        "doc" if key.startswith("doc_") else "mooc_item" if key in {"mooc_item", "video"} else key
                    )]
                })
                clauses = " OR ".join("(entity_type=%s AND entity_id=%s)" for _pair in pairs)
                params: list[Any] = [manifest.kb_id]
                for pair in pairs:
                    params.extend(pair)
                manifest.row_ids["n_knowledge_change"] = self._select_ids(
                    cursor, "n_knowledge_change", f"knowledge_base_id=%s AND ({clauses})", tuple(params),
                )
        finally:
            self._close(connection)

    def physical_cleanup(self, manifest) -> dict[str, int]:
        """在事务中按资源清单物理删除并重新查询剩余行数。"""
        self.collect_resource_ids(manifest)
        plan = build_cleanup_plan(manifest)
        connection = self._connection_factory()
        try:
            with connection.cursor() as cursor:
                for sql, params in plan:
                    cursor.execute(sql, params)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            self._close(connection)

        remaining: dict[str, int] = {}
        connection = self._connection_factory()
        try:
            with connection.cursor() as cursor:
                for sql, params in plan:
                    table = sql.split()[2]
                    cursor.execute(sql.replace("DELETE FROM", "SELECT COUNT(*) AS count FROM", 1), params)
                    count = int(cursor.fetchone()["count"])
                    if count:
                        remaining[table] = remaining.get(table, 0) + count
        finally:
            self._close(connection)
        return remaining

    def minio_config(self) -> dict[str, Any]:
        """读取当前权威 MinIO 配置，凭据仅保留在进程内存。"""
        connection = self._connection_factory()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT value FROM sys_config WHERE name=%s", ("MIN_IO_CONFIG",))
                row = cursor.fetchone()
                if row is None:
                    raise ValueError
                return json.loads(row["value"])
        finally:
            self._close(connection)

    def object_client(self) -> tuple[Minio, str, str]:
        """按当前配置创建对象客户端并返回桶与根路径。"""
        config = self.minio_config()
        endpoint = urlparse(config["endPoint"])
        client = Minio(
            endpoint.netloc,
            access_key=config["accessKey"],
            secret_key=config["secretKey"],
            secure=endpoint.scheme == "https",
            region=config.get("region") or "us-east-1",
        )
        return client, config["bucketName"], config["basePath"]

    def cleanup_objects(self, manifest) -> list[str]:
        """删除清单中的精确对象路径并通过 stat 复核。"""
        names = sorted(set(manifest.object_names))
        validate_fixture_object_names(names, manifest.prefix)
        client, bucket, base_path = self.object_client()
        remaining: list[str] = []
        for name in names:
            target = f"{base_path}/{name}"
            client.remove_object(bucket, target)
            try:
                client.stat_object(bucket, target)
            except S3Error:
                continue
            remaining.append(name)
        return remaining


class FixtureSourceAdapter:
    """把真实源适配器限定到固定知识库及本轮实体引用。

    @author 称霸幼儿园
    """

    def __init__(self, delegate, manifest):
        """保存真实源适配器与本轮资源清单。"""
        self._delegate = delegate
        self._manifest = manifest
        self._owned_refs = set(manifest.refs.values())

    async def iter_export(self, page_size: int = 100, entity_types=ALL_ENTITY_TYPES, **_kwargs):
        """仅从真实导出端点读取本轮知识库文档。"""
        async for documents in self._delegate.iter_export(
            kb_id=self._manifest.kb_id, page_size=page_size, entity_types=entity_types,
        ):
            yield documents

    async def fetch_by_refs(self, refs: list[str]) -> tuple[list[SourceDocument], list[str]]:
        """仅按本轮引用读取增量文档，忽略其他实体的变更。"""
        owned = [ref for ref in refs if ref in self._owned_refs]
        if not owned:
            return [], []
        return await self._delegate.fetch_by_refs(owned)

    async def extract_document(self, document: SourceDocument, runtime):
        """沿用真实文件下载与格式解析。"""
        return await self._delegate.extract_document(document, runtime)


class DeterministicEmbeddingAdapter:
    """以本地哈希向量验证索引行为，不发起模型网络请求。

    @author 称霸幼儿园
    """

    def __init__(self, dims: int = 8):
        """设置本地确定性向量维度。"""
        self.dims = dims
        self.embed_calls: list[list[str]] = []

    async def embed(self, snapshot, texts: list[str], timeout_s: float = 30.0):
        """返回相同输入的稳定向量并记录精确输入。"""
        if snapshot.resolve_embedding() is None:
            return None
        self.embed_calls.append(list(texts))
        vectors = []
        for text in texts:
            digest = hashlib.sha256(text.encode()).digest()
            vectors.append([round(digest[index % len(digest)] / 255.0, 6) for index in range(self.dims)])
        return vectors


async def cleanup_fixture_tokens(redis_client, username: str) -> int:
    """按临时用户名枚举、逐键核对并删除访问及刷新令牌。"""
    for token_type in ("ACCESS_TOKEN", "REFRESH_TOKEN"):
        prefix = f"{{{username}}}_{{{token_type}}}_"
        keys = [key async for key in redis_client.scan_iter(match=f"{prefix}*")]
        for key in keys:
            if not key.startswith(prefix):
                raise ValueError
            await redis_client.delete(key)
        remaining = [key async for key in redis_client.scan_iter(match=f"{prefix}*")]
        if remaining:
            return len(remaining)
    return 0


async def cleanup_legacy_documents(client, manifest) -> list[str]:
    """核对归属后精确删除共享 note/mooc 旧索引中的本轮文档。"""
    from elasticsearch import ApiError

    remaining: list[str] = []
    for index, key in (("note", "note"), ("mooc", "mooc")):
        entity_id = _entity_id(manifest, key)
        try:
            response = await client.get(index=index, id=str(entity_id))
        except ApiError as error:
            if error.status_code == 404:
                continue
            raise
        source = response.get("_source") or {}
        if not legacy_document_owned(source, manifest, entity_id):
            raise ValueError
        await client.delete(index=index, id=str(entity_id), refresh=True)
        if await client.exists(index=index, id=str(entity_id)):
            remaining.append(f"{index}:{entity_id}")
    return remaining
