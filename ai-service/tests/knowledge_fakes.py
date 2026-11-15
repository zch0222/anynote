"""知识检索测试用的 note 客户端、索引读取器与运行构造器替身。

@author 称霸幼儿园
"""

from typing import Any

from clients._internal import InternalServiceError
from core.config import HarnessRuntimeSettings
from harness.action.registry import ToolRegistry
from harness.models import AgentDefinition, RunContext, RunRequest, RunScope
from models.catalog import LogicalModelMapping, ModelCatalogSnapshot, ProviderSnapshot
from retrieval.models import (
    AuthorizationItem,
    ChunkHit,
    ContentResult,
    KnowledgeScope,
    OutlineResult,
    QueryResult,
    ScopeKnowledgeBase,
    StatsResult,
)
from retrieval.search import HybridSearcher
from retrieval.session import RetrievalSessionStore
from tools.knowledge import KNOWLEDGE_TOOL_NAMES, register_knowledge_tools
from tools.knowledge.common import KnowledgeToolContext


class FakeKnowledgeClient:
    """按预置数据响应的 note 用户端点替身，记录每次调用。"""

    def __init__(self, scope: KnowledgeScope | None = None):
        self.scope_result = scope or KnowledgeScope(
            userId=7, admin=False, defaultScope=True,
            knowledgeBases=[ScopeKnowledgeBase(kbId=1, name="库一", role="EDIT", permissions=2)],
        )
        self.readable: dict[tuple[str, str | None], AuthorizationItem] = {}
        self.contents: dict[str, list[ContentResult]] = {}
        self.outlines: dict[tuple[str, int | None], OutlineResult] = {}
        self.query_result = QueryResult()
        self.stats_result = StatsResult()
        self.calls: list[tuple[str, Any]] = []
        self.error: InternalServiceError | None = None

    def allow(self, ref: str, subtype: str | None = None, kb_id: int = 1, version: str = "v1",
              basis: str = "MEMBER") -> None:
        """登记一个可读实体。"""
        self.readable[(ref, subtype)] = AuthorizationItem(
            ref=ref, subtype=subtype, readable=True, permissionBasis=basis, kbId=kb_id,
            contentVersion=version, metaVersion="m1",
        )

    def _check(self) -> None:
        if self.error is not None:
            raise self.error

    async def scope(self, access_token, knowledge_base_ids=None, refs=None):
        self.calls.append(("scope", (access_token, knowledge_base_ids, refs)))
        self._check()
        return self.scope_result

    async def authorize(self, access_token, items):
        self.calls.append(("authorize", list(items)))
        self._check()
        assert len(items) <= 100
        return [self.readable.get((ref, subtype), AuthorizationItem(ref=ref, subtype=subtype, readable=False))
                for ref, subtype in items]

    async def content(self, access_token, request):
        self.calls.append(("content", dict(request)))
        self._check()
        pages = self.contents.get(request["ref"] + (f"#{request['subtype']}" if request.get("subtype") else ""))
        if not pages:
            raise InternalServiceError("anynote-note", "知识内容不存在或不可读", "A0404")
        offset = request.get("offset") or 0
        for page in pages:
            if page.next_offset is None or offset < page.next_offset:
                return page
        return pages[-1]

    async def outline(self, access_token, ref, parent_id=None, page_num=1, page_size=50):
        self.calls.append(("outline", (ref, parent_id, page_num, page_size)))
        self._check()
        result = self.outlines.get((ref, parent_id))
        if result is None:
            raise InternalServiceError("anynote-note", "知识内容不存在或不可读", "A0404")
        return result

    async def query(self, access_token, request):
        self.calls.append(("query", dict(request)))
        self._check()
        return self.query_result

    async def stats(self, access_token, knowledge_base_ids=None):
        self.calls.append(("stats", knowledge_base_ids))
        self._check()
        return self.stats_result

    def count(self, name: str) -> int:
        """统计某个端点的调用次数。"""
        return sum(1 for call, _ in self.calls if call == name)


class FakeIndexReader:
    """返回预置命中的索引读取器替身。"""

    def __init__(self):
        self.lexical_hits: list[ChunkHit] = []
        self.semantic_hits: list[ChunkHit] = []
        self.item_hits: list[ChunkHit] = []
        self.chunks: dict[str, list[ChunkHit]] = {}
        self.embedding: tuple[str | None, int | None] = (None, None)
        self.passing: set[str] | None = None
        self.parents: dict[str, str] = {}
        self.phrase_keys: list[str] = []
        self.error: Exception | None = None
        self.calls: list[tuple[str, Any]] = []

    def _check(self) -> None:
        if self.error is not None:
            raise self.error

    async def active_embedding(self):
        self._check()
        return self.embedding

    async def lexical(self, query, phrases, filters, size):
        self.calls.append(("lexical", (query, phrases, filters, size)))
        self._check()
        return list(self.lexical_hits)

    async def semantic(self, vector, filters, size):
        self.calls.append(("semantic", (vector, filters, size)))
        self._check()
        return list(self.semantic_hits)

    async def items(self, query, filters, size):
        self.calls.append(("items", (query, filters, size)))
        self._check()
        return list(self.item_hits)

    async def chunks_around(self, positions, window):
        self.calls.append(("around", (list(positions), window)))
        self._check()
        result: dict[str, dict[int, ChunkHit]] = {}
        for item_key, index in positions:
            for chunk in self.chunks.get(item_key, []):
                if chunk.chunk_index is not None and abs(chunk.chunk_index - index) <= window:
                    result.setdefault(item_key, {})[chunk.chunk_index] = chunk
        return result

    async def item_chunks(self, item_key, start_page=None, end_page=None):
        self.calls.append(("item_chunks", (item_key, start_page, end_page)))
        self._check()
        chunks = self.chunks.get(item_key, [])
        return [chunk for chunk in chunks
                if (start_page is None or (chunk.page_no or 0) >= start_page)
                and (end_page is None or (chunk.page_no or 0) <= end_page)]

    async def matching_item_keys(self, item_keys, filters):
        self.calls.append(("matching", list(item_keys)))
        self._check()
        if self.passing is None:
            return set(item_keys)
        return {key for key in item_keys if key in self.passing}

    async def item_parent(self, item_key):
        self._check()
        return self.parents.get(item_key)

    async def phrase_candidates(self, pattern, filters, limit):
        self.calls.append(("phrase", (pattern, limit)))
        self._check()
        return list(self.phrase_keys)[:limit]


class FakeEmbedder:
    """返回固定向量的嵌入替身。"""

    def __init__(self, vector: list[float] | None = None, error: Exception | None = None):
        self.vector = vector or [0.1, 0.2, 0.3]
        self.error = error
        self.calls = 0

    async def embed(self, snapshot, texts):
        self.calls += 1
        if self.error is not None:
            raise self.error
        return [list(self.vector) for _ in texts]


def chunk(item_key: str, index: int | None, content: str = "正文", entity_type: str = "note",
          authority: str = "original", page: int | None = None, version: str = "v1",
          section: str | None = None, kb_id: int = 1) -> ChunkHit:
    """构造一个片段命中。"""
    ref, _, subtype = item_key.partition("#")
    return ChunkHit(item_key=item_key, ref=ref, entity_type=entity_type, subtype=subtype or None, kb_id=kb_id,
                    title=f"标题-{ref}", chunk_index=index, content=content, section_path=section, page_no=page,
                    authority=authority, content_version=version)


def snapshot(embedding: bool = False, dims: int | None = 3, **retrieval) -> ModelCatalogSnapshot:
    """构造带检索参数的模型快照，可选启用嵌入。"""
    providers = []
    logical: dict[str, LogicalModelMapping] = {}
    if embedding:
        providers.append(ProviderSnapshot(providerKey="p", displayName="p", protocol="openai_compatible",
                                          baseUrl="http://p", apiKey="k", models=["emb"],
                                          dataEgressAllowed=True, enabled=True))
        logical["embedding"] = LogicalModelMapping(provider="p", model="emb", enabled=True, dimensions=dims)
    return ModelCatalogSnapshot(version="1:0", providers=providers, logicalModels=logical, retrieval=retrieval)


def make_tool_run(scope: RunScope | None = None, snap: ModelCatalogSnapshot | None = None,
                  run_id: str = "run-kb") -> RunContext:
    """构造带全部知识工具的运行上下文。"""
    agent = AgentDefinition(name="kb-test", version="1", goal="测试", instructions="测试",
                            tools=list(KNOWLEDGE_TOOL_NAMES))
    return RunContext(
        request=RunRequest(runId=run_id, input="问题", scope=scope),
        agent=agent,
        runtime=HarnessRuntimeSettings(),
        model_snapshot=snap or snapshot(),
        access_token="user-token",
    )


def make_toolkit(client: FakeKnowledgeClient, index: FakeIndexReader | None,
                 embedder: FakeEmbedder | None = None) -> tuple[ToolRegistry, RetrievalSessionStore]:
    """注册七个工具并返回注册表与会话仓库。"""
    store = RetrievalSessionStore(client, index)  # type: ignore[arg-type]
    registry = ToolRegistry()
    register_knowledge_tools(registry, KnowledgeToolContext(store=store, searcher=HybridSearcher(embedder)))
    return registry, store
