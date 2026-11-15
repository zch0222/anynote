"""知识索引管线核心编排器（增量消费、全量重建、漂移对账）。

@author 称霸幼儿园
"""

from datetime import UTC, datetime
from uuid import uuid4

from clients.file import FileClient
from clients.knowledge import KnowledgeClient
from clients.model_provider import ModelProviderClient
from clients.notify import NotifyClient
from core.config import IndexerRuntimeSettings, RuntimeConfigStore, Settings
from core.logger import get_logger
from indexing.adapters import KnowledgeSourceAdapter
from indexing.chunking import CHUNKER_VERSION, ChunkDraft, chunk_sections
from indexing.es_store import EMBEDDING_PROFILE_VERSION, ElasticsearchKnowledgeStore, _format_datetime
from indexing.models import (
    DOC_STATUS_FAILED,
    DOC_STATUS_INDEXED,
    DOC_STATUS_UNEXTRACTABLE,
    SCANNED_PDF_MESSAGE,
    ChunkPayload,
    KnowledgeChangeEvent,
    SourceDocument,
)
from indexing.outline import build_outline, build_summary
from indexing.parsers.pdf import PdfParseError
from models.catalog import ModelCatalogSnapshot
from models.openai_compatible import OpenAICompatibleAdapter


class IndexingPipeline:
    """协调拉取、解析、分块、向量化与 ES 索引写入。

    @author 称霸幼儿园
    """

    def __init__(
        self,
        settings: Settings,
        runtime_store: RuntimeConfigStore,
        model_provider_client: ModelProviderClient,
        model_adapter: OpenAICompatibleAdapter,
        knowledge_client: KnowledgeClient,
        file_client: FileClient,
        notify_client: NotifyClient,
        es_store: ElasticsearchKnowledgeStore,
    ):
        self._settings = settings
        self._runtime_store = runtime_store
        self._model_providers = model_provider_client
        self._model_adapter = model_adapter
        self._knowledge = knowledge_client
        self._adapter = KnowledgeSourceAdapter(knowledge_client, file_client, notify_client)
        self._store = es_store
        self._logger = get_logger(__name__)

    async def watermark(self) -> dict:
        """返回供内部健康探针读取的索引水位和规则版本。"""
        state = await self._store.get_watermark()
        return {
            "processed_cursor": int(state.get("cursor") or 0),
            "latest_cursor": int(state.get("latest_cursor") or 0),
            "lag_records": int(state.get("lag_records") or 0),
            "last_processed_at": state.get("last_processed_at"),
            "last_success_at": state.get("last_success_at"),
            "last_error_type": state.get("last_error_type"),
            "chunker_version": CHUNKER_VERSION,
            "embedding_profile_version": EMBEDDING_PROFILE_VERSION,
        }

    @property
    def _runtime(self) -> IndexerRuntimeSettings:
        return self._runtime_store.get().indexer

    async def _existing_items(
        self,
        item_idx: str,
        chunk_idx: str,
        keys: list[str],
        require_embeddings: bool,
    ) -> dict[str, dict]:
        """读取条目并独立核对片段代际、数量、版本和向量覆盖。"""
        items = await self._store.get_existing_items(item_idx, keys)
        chunks = await self._store.get_chunk_signatures(chunk_idx, keys)
        vector_keys = [(key, str(item.get("generation") or "")) for key, item in items.items()]
        vectors = await self._store.get_vector_counts(chunk_idx, vector_keys) if require_embeddings else {}
        for key, item in items.items():
            item["complete"] = await self._store.is_item_complete(
                item,
                chunks.get(key),
                vectors.get((key, str(item.get("generation") or ""))),
                require_embeddings,
            )
        return items

    async def _verify_source_documents(
        self,
        item_idx: str,
        chunk_idx: str,
        expected: dict[str, tuple[str, str]],
        require_embeddings: bool,
        kb_id: int | None = None,
    ) -> None:
        """独立读取 ES 核对源集合、双版本及每个条目的完整性。"""
        await self._store.refresh_indices(item_idx, chunk_idx)
        signatures = await self._store.list_item_signatures(item_idx, kb_id=kb_id)
        if signatures != expected:
            raise RuntimeError("Elasticsearch 源文档集合或版本核对失败")
        keys = list(expected)
        for start in range(0, len(keys), self._runtime.batch_size):
            batch = keys[start : start + self._runtime.batch_size]
            items = await self._existing_items(item_idx, chunk_idx, batch, require_embeddings)
            if any(not items.get(key, {}).get("complete") for key in batch):
                raise RuntimeError("Elasticsearch 片段完整性核对失败")
        chunk_keys = set(await self._store.get_chunk_signatures(chunk_idx, kb_id=kb_id))
        if chunk_keys - set(expected):
            raise RuntimeError("Elasticsearch 孤儿片段核对失败")

    async def _resolve_embedding_profile(
        self,
        snapshot: ModelCatalogSnapshot,
        probe_if_missing_dims: bool = False,
    ) -> tuple[str | None, int | None]:
        resolved = snapshot.resolve_embedding()
        if resolved is None:
            return None, None
        _provider, model, dims = resolved
        if dims is None and probe_if_missing_dims:
            vectors = await self._model_adapter.embed(
                snapshot,
                ["向量维度探测"],
                timeout_s=self._runtime.embedding_timeout_s,
            )
            if vectors and vectors[0]:
                dims = len(vectors[0])
        return model, dims

    async def _embed_drafts(
        self,
        snapshot: ModelCatalogSnapshot,
        drafts: list[ChunkDraft],
        resolved_model: str | None,
        title: str = "",
    ) -> tuple[list[list[float]] | None, int | None]:
        """按标题、完整章节路径和正文批量生成向量。

        :param drafts: 有序分块内容
        :param title: 源条目标题
        :return: 向量列表及推断维度，停用时返回两个 None
        """
        if resolved_model is None or not drafts:
            return None, None
        batch_size = self._runtime.embedding_batch_size
        vectors: list[list[float]] = []
        for start in range(0, len(drafts), batch_size):
            batch_texts = [
                f"标题：{title}\n标题路径：{draft.section_path or ''}\n正文：{draft.content}"
                for draft in drafts[start : start + batch_size]
            ]
            part = await self._model_adapter.embed(
                snapshot,
                batch_texts,
                timeout_s=self._runtime.embedding_timeout_s,
            )
            if part is None:
                return None, None
            vectors.extend(part)
        dims = len(vectors[0]) if vectors and vectors[0] else None
        return vectors, dims

    def _build_chunk_payloads(
        self,
        doc: SourceDocument,
        drafts: list[ChunkDraft],
        vectors: list[list[float]] | None,
    ) -> list[ChunkPayload]:
        acl = doc.acl
        source_updated = _format_datetime(doc.source_updated_at)
        payloads: list[ChunkPayload] = []
        for idx, draft in enumerate(drafts):
            payloads.append(
                ChunkPayload(
                    chunk_id=f"{doc.canonical_key}#{draft.chunk_index}",
                    item_key=doc.canonical_key,
                    ref=doc.ref,
                    entity_type=doc.entity_type,
                    subtype=doc.subtype,
                    entity_id=doc.entity_id,
                    kb_id=doc.kb_id,
                    chunk_index=draft.chunk_index,
                    title=doc.title or "",
                    content=draft.content,
                    section_path=draft.section_path,
                    page_no=draft.page_no,
                    start_ms=draft.start_ms,
                    end_ms=draft.end_ms,
                    start_line=draft.start_line,
                    end_line=draft.end_line,
                    authority=doc.authority,
                    content_version=doc.content_version or "",
                    meta_version=doc.meta_version or "",
                    create_by=acl.create_by if acl else None,
                    permissions=acl.permissions if acl else None,
                    data_scope=acl.data_scope if acl else None,
                    task_member_ids=acl.task_member_ids if acl else None,
                    source_updated_at=source_updated,
                    embedding=vectors[idx] if vectors is not None else None,
                )
            )
        return payloads

    async def _index_document(
        self,
        doc: SourceDocument,
        snapshot: ModelCatalogSnapshot,
        item_idx: str,
        chunk_idx: str,
        emb_model: str | None,
        emb_dims: int | None,
        existing_map: dict[str, dict] | None,
        delete_existing_chunks: bool,
        ensure_active_on_embed: bool,
        publish_source_status: bool = True,
    ) -> str:
        """写入单条源文档及分片，并按选项回写资料成功状态。

        :param doc: 待索引的权威源文档
        :param publish_source_status: 是否立即回写资料成功状态
        :return: 索引处理结果类型
        """
        existing = existing_map.get(doc.canonical_key) if existing_map is not None else None
        if existing is not None:
            same_content = (existing.get("content_version") or "") == (doc.content_version or "")
            same_meta = (existing.get("meta_version") or "") == (doc.meta_version or "")
            same_title = (existing.get("title") or "") == (doc.title or "")
            complete = existing.get("complete") is True
            if same_content and same_meta and same_title and complete and existing.get("index_status") in (DOC_STATUS_INDEXED, DOC_STATUS_UNEXTRACTABLE):
                status = existing["index_status"]
                if publish_source_status and doc.entity_type == "doc" and doc.attributes.get("indexStatus") != status:
                    await self._knowledge.update_doc_index_status(doc.entity_id, status)
                return "skipped"
            if same_content and same_title and complete and existing.get("index_status") == DOC_STATUS_INDEXED:
                await self._store.update_metadata_only(item_idx, chunk_idx, doc)
                if publish_source_status and doc.entity_type == "doc" and doc.attributes.get("indexStatus") != DOC_STATUS_INDEXED:
                    await self._knowledge.update_doc_index_status(doc.entity_id, DOC_STATUS_INDEXED)
                return "meta_updated"

        try:
            parsed = await self._adapter.extract_document(doc, self._runtime)
        except PdfParseError as error:
            self._logger.error("解析 PDF 失败 ref=%s: %s", doc.ref, error)
            if doc.entity_type == "doc":
                await self._knowledge.update_doc_index_status(doc.entity_id, DOC_STATUS_FAILED)
            raise

        if parsed.unextractable:
            self._logger.warning("%s ref=%s", SCANNED_PDF_MESSAGE, doc.ref)
            await self._store.upsert_item_and_chunks(
                item_idx=item_idx,
                chunk_idx=chunk_idx,
                document=doc,
                chunks=[],
                index_status=DOC_STATUS_UNEXTRACTABLE,
                delete_existing_chunks=delete_existing_chunks,
                summary=build_summary(doc.title, [], self._runtime.summary_body_chars),
            )
            if publish_source_status and doc.entity_type == "doc":
                await self._knowledge.update_doc_index_status(doc.entity_id, DOC_STATUS_UNEXTRACTABLE)
            return "unextractable"

        drafts = chunk_sections(
            parsed.sections,
            chunk_size_chars=self._runtime.chunk_size_chars,
        )
        vectors, inferred_dims = await self._embed_drafts(snapshot, drafts, emb_model, doc.title or "")
        effective_dims = emb_dims if emb_dims is not None else inferred_dims
        if ensure_active_on_embed:
            item_idx, chunk_idx = await self._store.ensure_active_indices(emb_model, effective_dims)
        payloads = self._build_chunk_payloads(doc, drafts, vectors)
        await self._store.upsert_item_and_chunks(
            item_idx=item_idx,
            chunk_idx=chunk_idx,
            document=doc,
            chunks=payloads,
            index_status=DOC_STATUS_INDEXED,
            delete_existing_chunks=delete_existing_chunks,
            outline=build_outline(parsed.sections),
            summary=build_summary(doc.title, parsed.sections, self._runtime.summary_body_chars),
        )
        if publish_source_status and doc.entity_type == "doc":
            await self._knowledge.update_doc_index_status(doc.entity_id, DOC_STATUS_INDEXED)
        return "indexed"

    @staticmethod
    def _collapse_changes(
        events: list[KnowledgeChangeEvent],
    ) -> tuple[list[str], list[str], list[int]]:
        latest_by_ref: dict[str, KnowledgeChangeEvent] = {}
        for event in events:
            latest_by_ref[event.ref] = event

        upsert_refs: list[str] = []
        delete_refs: list[str] = []
        delete_kb_ids: list[int] = []
        for ref, event in latest_by_ref.items():
            op = (event.operation or "").strip().upper()
            if op == "DELETE":
                delete_refs.append(ref)
                if event.entity_type == "kb":
                    delete_kb_ids.append(event.entity_id)
                elif event.entity_type == "mooc_item":
                    delete_refs.append(f"mooc_item:{event.entity_id}#transcript")
                    delete_refs.append(f"mooc_item:{event.entity_id}#summary")
            else:
                upsert_refs.append(ref)
        return upsert_refs, delete_refs, delete_kb_ids

    async def run_incremental(self) -> int:
        """消费增量知识变更游标并更新当前激活索引。

        :return: 本轮处理的变更记录总数
        """
        previous = await self._store.get_watermark()
        cursor = await self._store.get_cursor()
        self._latest_cursor = max(cursor, int(previous.get("latest_cursor") or 0))
        try:
            page = await self._knowledge.changes(after_id=cursor, limit=1)
            self._latest_cursor = page.latest_cursor
            processed = await self._consume_incremental()
        except Exception as error:
            await self._store.save_watermark(
                self._latest_cursor,
                await self._store.get_cursor(),
                datetime.now(UTC).isoformat(),
                previous.get("last_success_at"),
                type(error).__name__,
            )
            raise
        now = datetime.now(UTC).isoformat()
        await self._store.save_watermark(
            self._latest_cursor,
            await self._store.get_cursor(),
            now,
            now,
            None,
        )
        return processed

    async def _consume_incremental(self) -> int:
        """按页完成索引刷新后提交游标，失败保留上一成功页水位。"""
        snapshot = await self._model_providers.snapshot()
        emb_model, emb_dims = await self._resolve_embedding_profile(snapshot, probe_if_missing_dims=False)
        item_idx, chunk_idx = await self._store.ensure_active_indices(emb_model, emb_dims)

        cursor = await self._store.get_cursor()
        processed = 0
        mutated = False

        while True:
            page = await self._knowledge.changes(after_id=cursor, limit=self._runtime.batch_size)
            self._latest_cursor = page.latest_cursor
            if not page.changes:
                break

            upsert_refs, delete_refs, delete_kb_ids = self._collapse_changes(page.changes)
            if upsert_refs:
                docs, missing_refs = await self._adapter.fetch_by_refs(upsert_refs)
                delete_refs.extend(missing_refs)
                existing_map = await self._existing_items(
                    item_idx,
                    chunk_idx,
                    [doc.canonical_key for doc in docs],
                    emb_model is not None,
                )
                for doc in docs:
                    outcome = await self._index_document(
                        doc=doc,
                        snapshot=snapshot,
                        item_idx=item_idx,
                        chunk_idx=chunk_idx,
                        emb_model=emb_model,
                        emb_dims=emb_dims,
                        existing_map=existing_map,
                        delete_existing_chunks=True,
                        ensure_active_on_embed=True,
                    )
                    if outcome != "skipped":
                        mutated = True

            if delete_refs:
                await self._store.delete_refs(item_idx, chunk_idx, delete_refs)
                mutated = True
            for kb_id in delete_kb_ids:
                await self._store.delete_by_kb_id(item_idx, chunk_idx, kb_id)
                mutated = True

            processed += len(page.changes)
            cursor = page.next_cursor
            if mutated:
                await self._store.refresh_indices(item_idx, chunk_idx)
            await self._store.save_cursor(cursor)

        if mutated:
            await self._store.refresh_indices(item_idx, chunk_idx)
        return processed

    async def run_rebuild(self) -> int:
        """构建新版本物理索引，导出全量 9 类源实体后原子切换别名。

        :return: 新版本中写入的源文档数量
        """
        snapshot = await self._model_providers.snapshot()
        baseline = await self._knowledge.changes(after_id=0, limit=1)
        start_cursor = baseline.latest_cursor

        emb_model, emb_dims = await self._resolve_embedding_profile(snapshot, probe_if_missing_dims=True)
        active = await self._store.get_active_meta()
        next_version = (int(active["version"]) + 1) if active else 1
        new_item_idx, new_chunk_idx = await self._store.create_versioned_indices(
            next_version,
            emb_dims,
            attempt_id=uuid4().hex,
        )
        total_docs = 0
        stats = {"attempted": 0, "succeeded": 0, "failed": 0, "unextractable": 0}
        expected: dict[str, tuple[str, str]] = {}
        pending_statuses: list[tuple[int, int]] = []
        try:
            async for docs in self._adapter.iter_export(page_size=self._runtime.batch_size):
                for doc in docs:
                    stats["attempted"] += 1
                    outcome = await self._index_document(
                        doc=doc,
                        snapshot=snapshot,
                        item_idx=new_item_idx,
                        chunk_idx=new_chunk_idx,
                        emb_model=emb_model,
                        emb_dims=emb_dims,
                        existing_map=None,
                        delete_existing_chunks=False,
                        ensure_active_on_embed=False,
                        publish_source_status=False,
                    )
                    if outcome == "unextractable":
                        stats["unextractable"] += 1
                    else:
                        stats["succeeded"] += 1
                    total_docs += 1
                    expected[doc.canonical_key] = (doc.content_version or "", doc.meta_version or "")
                    if doc.entity_type == "doc":
                        status = DOC_STATUS_UNEXTRACTABLE if outcome == "unextractable" else DOC_STATUS_INDEXED
                        pending_statuses.append((doc.entity_id, status))
            await self._verify_source_documents(
                new_item_idx,
                new_chunk_idx,
                expected,
                emb_model is not None,
            )
        except Exception:
            stats["failed"] += 1
            self._logger.error("全量索引重建失败 stats=%s", stats)
            await self._store.delete_versioned_indices(new_item_idx, new_chunk_idx)
            raise
        try:
            await self._store.swap_aliases(
                next_version,
                emb_model,
                emb_dims,
                item_idx=new_item_idx,
                chunk_idx=new_chunk_idx,
            )
        except Exception:
            current = await self._store.get_active_meta()
            if current is None or current.get("item_index") != new_item_idx:
                await self._store.delete_versioned_indices(new_item_idx, new_chunk_idx)
            raise
        latest = await self._knowledge.changes(after_id=start_cursor, limit=1)
        completed_at = datetime.now(UTC).isoformat()
        await self._store.save_watermark(
            latest_cursor=latest.latest_cursor,
            processed_cursor=start_cursor,
            last_processed_at=completed_at,
            last_success_at=completed_at,
            last_error_type=None,
        )
        for doc_id, status in pending_statuses:
            await self._knowledge.update_doc_index_status(doc_id, status)
        self._logger.info(
            "全量索引重建完成 version=v%d docs=%d model=%s dims=%s stats=%s",
            next_version,
            total_docs,
            emb_model or "disabled",
            emb_dims,
            stats,
        )
        return total_docs

    async def run_reconcile(self, kb_id: int | None = None) -> dict[str, int]:
        """对比权威源与当前激活索引，补漏新增变更并清理已失效文档。

        :param kb_id: 可选仅对账指定知识库
        :return: 对账统计信息
        """
        snapshot = await self._model_providers.snapshot()
        emb_model, emb_dims = await self._resolve_embedding_profile(snapshot, probe_if_missing_dims=True)
        item_idx, chunk_idx = await self._store.ensure_active_indices(emb_model, emb_dims)
        await self._store.refresh_indices(item_idx, chunk_idx)
        existing_sigs = await self._store.list_item_signatures(item_idx, kb_id=kb_id)
        existing_chunk_keys = set(await self._store.get_chunk_signatures(chunk_idx, kb_id=kb_id))

        stats = {
            "indexed": 0,
            "meta_updated": 0,
            "skipped": 0,
            "deleted": 0,
            "unextractable": 0,
            "failed": 0,
        }
        seen_refs: set[str] = set()
        expected: dict[str, tuple[str, str]] = {}

        async for docs in self._adapter.iter_export(kb_id=kb_id, page_size=self._runtime.batch_size):
            existing_map = await self._existing_items(
                item_idx,
                chunk_idx,
                [doc.canonical_key for doc in docs],
                emb_model is not None,
            )
            for doc in docs:
                seen_refs.add(doc.canonical_key)
                expected[doc.canonical_key] = (doc.content_version or "", doc.meta_version or "")
                outcome = await self._index_document(
                    doc=doc,
                    snapshot=snapshot,
                    item_idx=item_idx,
                    chunk_idx=chunk_idx,
                    emb_model=emb_model,
                    emb_dims=emb_dims,
                    existing_map=existing_map,
                    delete_existing_chunks=True,
                    ensure_active_on_embed=True,
                )
                stats[outcome] = stats.get(outcome, 0) + 1

        orphan_refs = sorted((set(existing_sigs) | existing_chunk_keys) - seen_refs)
        if orphan_refs:
            await self._store.delete_refs(item_idx, chunk_idx, orphan_refs)
            stats["deleted"] = len(orphan_refs)

        await self._verify_source_documents(item_idx, chunk_idx, expected, emb_model is not None, kb_id)
        return stats
