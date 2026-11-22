"""八个只读知识工具的注册。

@author 称霸幼儿园
"""

from harness.action.registry import ToolRegistry
from tools.knowledge import kb_grep, kb_list, kb_outline, kb_query, kb_read, kb_related, kb_search, kb_view_doc
from tools.knowledge.common import KnowledgeToolContext

KNOWLEDGE_TOOL_NAMES = (
    "kb_list", "kb_outline", "kb_search", "kb_grep", "kb_read", "kb_query", "kb_related", "kb_view_doc",
)


def register_knowledge_tools(registry: ToolRegistry, context: KnowledgeToolContext) -> None:
    """把八个知识工具注册到工具注册表。

    :param registry: 工具注册表
    :param context: 工具共享上下文
    """
    for module in (kb_list, kb_outline, kb_search, kb_grep, kb_read, kb_query, kb_related, kb_view_doc):
        registry.register(module.build(context))
