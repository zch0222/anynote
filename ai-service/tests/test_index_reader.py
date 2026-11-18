"""知识索引读取请求测试。

@author 称霸幼儿园
"""

from unittest.mock import AsyncMock

from retrieval.index_reader import KnowledgeIndexReader


async def test_lexical_highlight_does_not_insert_markup_tags():
    """全文检索请求高亮片段时不添加标签。"""
    client = AsyncMock()
    client.search.return_value = {"hits": {"hits": []}}
    reader = KnowledgeIndexReader(client)

    await reader.lexical("倒排索引", [], [], 5)

    highlight = client.search.await_args.kwargs["highlight"]
    assert highlight["pre_tags"] == [""]
    assert highlight["post_tags"] == [""]
