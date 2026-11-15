"""条目大纲与摘要、PDF 标题识别与双栏、片段不重叠及索引 schema 版本单元测试。

@author 称霸幼儿园
"""

import io

import pytest
from pypdf import PdfReader, PdfWriter

from indexing.chunking import CHUNKER_VERSION, chunk_sections
from indexing.es_store import (
    EMBEDDING_PROFILE_VERSION,
    INDEX_SCHEMA_VERSION,
    ElasticsearchKnowledgeStore,
    _build_chunk_mappings,
    _build_item_mappings,
)
from indexing.models import IndexVersionConflictError, ParsedSection, SourceAcl, SourceDocument
from indexing.outline import build_outline, build_summary, replace_summary_title
from indexing.parsers.pdf import (
    PdfBookmark,
    PdfLine,
    build_pdf_sections,
    extract_pdf_sections_sync,
    group_lines,
    heading_levels,
    is_heading_line,
    split_columns,
)


def _pdf(pages: list[list[tuple[float, float, float, str]]]) -> bytes:
    """生成多页 PDF：每项为（x, y, 字号, 文本）。"""
    objs: list[bytes] = []
    kids = []
    page_objs: list[bytes] = []
    content_objs: list[bytes] = []
    for index, items in enumerate(pages):
        page_id = 4 + index * 2
        content_id = page_id + 1
        kids.append(f"{page_id} 0 R")
        stream = " ".join(f"BT /F1 {size} Tf {x} {y} Td ({text}) Tj ET" for x, y, size, text in items).encode("latin1")
        page_objs.append(
            f"{page_id} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >> endobj\n".encode("latin1")
        )
        content_objs.append(
            f"{content_id} 0 obj << /Length {len(stream)} >> stream\n".encode("latin1") + stream + b"\nendstream endobj\n"
        )
    objs.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    objs.append(f"2 0 obj << /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >> endobj\n".encode("latin1"))
    objs.append(b"3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
    for page_obj, content_obj in zip(page_objs, content_objs, strict=True):
        objs.extend([page_obj, content_obj])
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)
    xref = len(out)
    out.extend(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode("latin1"))
    for offset in offsets:
        out.extend(f"{offset:010d} 00000 n \n".encode("latin1"))
    out.extend(f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("latin1"))
    return bytes(out)


def test_outline_and_summary_are_deterministic():
    """大纲按顺序去重拼接标题路径；摘要首行为标题，其后为小标题与正文开头。"""
    sections = [ParsedSection(text="第一段  正文", section_path="总览"),
                ParsedSection(text="细节", section_path="总览 / 子节"),
                ParsedSection(text="更多", section_path="总览")]
    assert build_outline(sections) == "总览\n总览 / 子节"
    assert build_summary("标\n题", sections, 4) == "标 题\n总览 子节\n第一段 "
    assert build_summary("无正文", [], 200) == "无正文"


def test_replace_summary_title_keeps_body_part():
    """只改标题时摘要首行替换，小标题与正文保持不变。"""
    assert replace_summary_title("旧标题\n总览\n正文", "新标题") == "新标题\n总览\n正文"
    assert replace_summary_title(None, "新标题") == "新标题"


def test_chunks_never_overlap():
    """长段落切分后各片段首尾相接，不存在重叠文本。"""
    text = "".join(f"第{i}句。" for i in range(200))
    chunks = chunk_sections([ParsedSection(text=text)], chunk_size_chars=100)
    assert "".join(chunk.content for chunk in chunks) == text
    assert all(len(chunk.content) <= 100 for chunk in chunks)


def test_heading_rules_and_levels():
    """标题须字号够大、够短、不以句末标点结尾；按字号从大到小分最多三级。"""
    assert is_heading_line(PdfLine("Chapter One", 14.4), 12.0) is True
    assert is_heading_line(PdfLine("Chapter One", 14.0), 12.0) is False
    assert is_heading_line(PdfLine("结论如下。", 20.0), 12.0) is False
    assert is_heading_line(PdfLine("x" * 81, 20.0), 12.0) is False
    assert heading_levels([24, 18, 16, 14.2]) == {24.0: 1, 18.0: 2, 16.0: 3, 14.0: 3}


def test_split_columns_detects_two_columns_and_keeps_spanning_page():
    """中线留白且两侧都有足够单词时按先左后右拆栏，跨中线的页面不拆。"""
    left = [{"text": "L", "x0": 40.0, "x1": 200.0, "top": 10.0}] * 4
    right = [{"text": "R", "x0": 350.0, "x1": 560.0, "top": 10.0}] * 4
    assert split_columns(left + right, 600.0) == [left, right]
    spanning = [{"text": "Title", "x0": 200.0, "x1": 400.0, "top": 5.0}]
    assert split_columns(left + right + spanning, 600.0) == [left + right + spanning]
    assert split_columns(left + right[:1], 600.0) == [left + right[:1]]


def test_group_lines_orders_words_and_joins_cjk():
    """同一纵坐标的单词合并为一行，中文之间不留空格。"""
    words = [{"text": "世界", "x0": 30.0, "top": 10.5, "size": 10}, {"text": "你好", "x0": 10.0, "top": 10.0, "size": 10},
             {"text": "next", "x0": 10.0, "top": 30.0, "size": 12}]
    lines = group_lines(words)
    assert [line.text for line in lines] == ["你好世界", "next"]


def test_bookmarks_split_page_at_matching_line():
    """书签标题出现在页内时从该行切开，未出现时从页首生效。"""
    pages = [(1, [PdfLine("intro text", 10), PdfLine("Part Two", 10), PdfLine("second", 10)], 10.0),
             (2, [PdfLine("third", 10)], 10.0)]
    bookmarks = [PdfBookmark("Intro", 1, 1), PdfBookmark("Part Two", 1, 1), PdfBookmark("Detail", 2, 2)]
    sections = build_pdf_sections(pages, bookmarks)
    assert [(section.section_path, section.text, section.page_no) for section in sections] == [
        ("Intro", "intro text", 1), ("Part Two", "second", 1), ("Part Two / Detail", "third", 2)]


def test_real_pdf_heading_detection_and_columns():
    """真实 PDF：大字号行识别为标题进入路径，双栏页面先读左栏再读右栏。"""
    data = _pdf([
        [(40, 750, 20, "Chapter One"), (40, 700, 10, "Body line A."), (40, 680, 10, "Body line B.")],
        [(40, 700, 10, "Left A"), (40, 680, 10, "Left B"), (350, 700, 10, "Right A"), (350, 680, 10, "Right B")],
    ])
    parsed = extract_pdf_sections_sync(data, timeout_s=20.0)
    assert parsed.unextractable is False
    assert parsed.sections[0].section_path == "Chapter One"
    assert "Chapter One" not in parsed.sections[0].text
    assert parsed.sections[1].page_no == 2
    assert parsed.sections[1].text.split("\n") == ["Left A", "Left B", "Right A", "Right B"]


def test_real_pdf_bookmarks_become_heading_tree():
    """真实 PDF 带书签时以书签作为标题树。"""
    base = _pdf([[(40, 700, 10, "first page body")], [(40, 700, 10, "second page body")]])
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(base)))
    writer.add_outline_item("Intro", 0)
    writer.add_outline_item("Part Two", 1)
    buffer = io.BytesIO()
    writer.write(buffer)
    parsed = extract_pdf_sections_sync(buffer.getvalue(), timeout_s=20.0)
    assert [(section.section_path, section.page_no) for section in parsed.sections] == [("Intro", 1), ("Part Two", 2)]


def test_mappings_include_outline_summary_and_task_members():
    """schema 3 保留大纲、摘要与任务成员并补可读状态和源行号。

    @author 称霸幼儿园
    """
    item = _build_item_mappings()["properties"]
    chunk = _build_chunk_mappings(None)["properties"]
    assert item["outline"]["analyzer"] == "cjk" and item["summary"]["analyzer"] == "cjk"
    assert item["task_member_ids"] == {"type": "long"}
    assert chunk["task_member_ids"] == {"type": "long"}
    assert item["readable"] == chunk["readable"] == {"type": "boolean"}
    assert chunk["start_line"] == chunk["end_line"] == {"type": "integer"}
    assert INDEX_SCHEMA_VERSION == 3


class _FakeIndices:
    def __init__(self, active):
        self._active = active

    async def exists(self, index):
        return True

    async def get_alias(self, name):
        """返回与当前激活快照一致的测试别名目标。"""
        field = "item_index" if name == "kn_item" else "chunk_index"
        target = self._active.get(field)
        return {target: {"aliases": {name: {}}}} if target else {}


class _FakeEs:
    def __init__(self, active: dict, stored_summary: str | None = None):
        self.indices = _FakeIndices(active)
        self._active = active
        self._stored = stored_summary
        self.updates: list[dict] = []
        self.scripts: list[dict] = []

    async def get(self, index, id, _source=None):
        if id == "active":
            return {"found": True, "_source": dict(self._active)}
        return {"found": True, "_source": {"summary": self._stored}}

    async def update(self, index, id, doc, refresh=False):
        self.updates.append(doc)

    async def update_by_query(self, index, query, script, conflicts, refresh):
        self.scripts.append(script)
        return {"failures": [], "version_conflicts": 0, "timed_out": False}


async def test_old_schema_requires_rebuild():
    """激活索引缺少版本字段或规则版本不匹配时拒绝写入。

    @author 称霸幼儿园
    """
    store = ElasticsearchKnowledgeStore(_FakeEs({"version": 1, "item_index": "kn_item_v1",
                                                 "chunk_index": "kn_chunk_v1"}))  # type: ignore[arg-type]
    with pytest.raises(IndexVersionConflictError):
        await store.ensure_active_indices(None, None)
    active = {"version": 2, "schema_version": INDEX_SCHEMA_VERSION,
              "chunker_version": CHUNKER_VERSION, "embedding_profile_version": EMBEDDING_PROFILE_VERSION,
              "item_index": "kn_item_v2", "chunk_index": "kn_chunk_v2"}
    for field, value in (("schema_version", 2), ("chunker_version", "old"),
                         ("embedding_profile_version", "old")):
        incompatible = ElasticsearchKnowledgeStore(_FakeEs({**active, field: value}))  # type: ignore[arg-type]
        with pytest.raises(IndexVersionConflictError):
            await incompatible.ensure_active_indices(None, None)
    current = ElasticsearchKnowledgeStore(_FakeEs(active))  # type: ignore[arg-type]
    assert await current.ensure_active_indices(None, None) == ("kn_item_v2", "kn_chunk_v2")


async def test_metadata_only_update_writes_task_members_and_retitles_summary():
    """元数据写入同步任务成员和摘要，并在完成后恢复可读状态。

    @author 称霸幼儿园
    """
    client = _FakeEs({}, stored_summary="旧标题\n正文开头")
    store = ElasticsearchKnowledgeStore(client)  # type: ignore[arg-type]
    document = SourceDocument(ref="task:4", entityType="task", entityId=4, kbId=1, title="新标题",
                              acl=SourceAcl(createBy=7, taskMemberIds=[8, 9]), metaVersion="m2")
    await store.update_metadata_only("kn_item_v2", "kn_chunk_v2", document)
    item_metadata = next(update for update in client.updates if "task_member_ids" in update)
    chunk_metadata = next(script["params"] for script in client.scripts if "task_member_ids" in script["params"])
    assert item_metadata["task_member_ids"] == chunk_metadata["task_member_ids"] == [8, 9]
    assert item_metadata["summary"] == "新标题\n正文开头"
    assert chunk_metadata["create_by"] == 7
    assert chunk_metadata["meta_version"] == "m2"
    assert [update["readable"] for update in client.updates if "readable" in update] == [False, True]
    assert [script["params"]["value"] for script in client.scripts if "value" in script["params"]] == [False, True]
