"""证据编号去重、相邻扩展、定位符与文本工具单元测试。

@author 称霸幼儿园
"""

from retrieval.evidence import EvidenceRegistry
from retrieval.models import ChunkHit
from retrieval.search import expand_neighbors, locator_from_chunks
from retrieval.text import extract_note_links, grep_lines, take_chars, utf16_length


def _register(registry: EvidenceRegistry, item_key: str, locator: dict, text: str = "正文"):
    return registry.register(
        item_key=item_key, entity_type="note", text=text, title="标题", locator=locator, kb_id=1,
        kb_name="库", authority="original", content_version="v1", stale=False, permission_basis="AUTHOR",
        retrieval={"channels": {"lexical": 1}}, selected_reason="kb_search",
    )


def test_registry_assigns_sequential_ids_and_merges_same_position():
    """同一位置多次命中复用编号且不覆盖内容，不同位置递增编号。"""
    registry = EvidenceRegistry()
    first = _register(registry, "note:1", {"chunkStart": 0, "chunkEnd": 0})
    again = _register(registry, "note:1", {"chunkEnd": 0, "chunkStart": 0}, text="另一段")
    other = _register(registry, "note:1", {"chunkStart": 1, "chunkEnd": 1})
    assert first.evidence_id == "E1"
    assert again.evidence_id == "E1"
    assert again.content == "正文"
    assert other.evidence_id == "E2"
    assert len(registry) == 2


def test_registry_keeps_trace_only_fields_on_evidence():
    """证据带知识库、权威性、滞后标记、权限依据与检索通道。"""
    item = _register(EvidenceRegistry(), "doc:3", {"pageStart": 2})
    assert (item.kb_id, item.kb_name, item.authority, item.stale) == (1, "库", "original", False)
    assert item.permission_basis == "AUTHOR"
    assert item.retrieval == {"channels": {"lexical": 1}}


def _chunk(index: int, content: str, page: int | None = None) -> ChunkHit:
    return ChunkHit(item_key="doc:1", ref="doc:1", entity_type="doc", subtype=None, kb_id=1, title="资料",
                    chunk_index=index, content=content, section_path="第一章", page_no=page)


def test_expand_neighbors_respects_total_budget_and_order():
    """按排名补相邻片段，总字数不超上限，命中片段始终保留且按序号排列。"""
    around = {"doc:1": {i: _chunk(i, "a" * 10, page=i + 1) for i in range(5)}}
    groups = expand_neighbors([_chunk(2, "a" * 10)], around, window=1, max_chars=30)
    assert [chunk.chunk_index for chunk in groups[0]] == [1, 2, 3]
    tight = expand_neighbors([_chunk(2, "a" * 10)], around, window=2, max_chars=15)
    assert [chunk.chunk_index for chunk in tight[0]] == [2]


def test_expand_neighbors_skips_chunks_already_selected_or_included():
    """同一实体的相邻命中互不重复补入，已被前一个命中补入的片段不再补给后一个。"""
    around = {"doc:1": {i: _chunk(i, "a" * 10) for i in range(5)}}
    groups = expand_neighbors([_chunk(1, "a" * 10), _chunk(2, "a" * 10)], around, window=1, max_chars=1000)
    assert [chunk.chunk_index for chunk in groups[0]] == [0, 1]
    assert [chunk.chunk_index for chunk in groups[1]] == [2, 3]


def test_locator_from_chunks_spans_pages_and_drops_empty():
    """定位符覆盖片段序号与页码范围，空字段不输出。"""
    locator = locator_from_chunks([_chunk(1, "x", 3), _chunk(2, "y", 4)], "第一章")
    assert locator == {"chunkStart": 1, "chunkEnd": 2, "sectionPath": "第一章", "pageStart": 3, "pageEnd": 4}


def test_utf16_length_counts_java_chars():
    """续读偏移按 Java 字符计数，补充平面字符算 2。"""
    assert utf16_length("中文") == 2
    assert utf16_length("😀a") == 3


def test_take_chars_reports_truncation():
    """超过上限时截断并返回标记。"""
    assert take_chars("abcdef", 4) == ("abcd", True)
    assert take_chars("ab", 4) == ("ab", False)


def test_grep_lines_returns_line_numbers_context_and_limit():
    """字面查找返回从 1 起的行号与上下文，达到上限时标记截断。"""
    lines = ["intro", "Index A", "middle", "index b", "end"]
    hits, cut = grep_lines(lines, "INDEX", ignore_case=True, context=1, max_hits=1, pages=[1, 1, 2, 2, 3])
    assert cut is True
    assert (hits[0].line_no, hits[0].start_line, hits[0].end_line, hits[0].page_no) == (2, 1, 3, 1)
    assert hits[0].text == "intro\nIndex A\nmiddle"
    exact, _ = grep_lines(lines, "INDEX", ignore_case=False, context=0, max_hits=10)
    assert exact == []


def test_extract_note_links_desktop_mobile_and_absolute():
    """解析桌面、移动与绝对地址的笔记链接并去重，不误认其他路径。"""
    content = "见 [a](/notes/3/12) 和 [b](https://x.test/m/notes/3/15) 及 /notes/3/12，忽略 /notes/3/docs"
    assert extract_note_links(content) == [(3, 12), (3, 15)]
