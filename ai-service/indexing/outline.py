"""条目级大纲与确定性摘要的生成。

@author 称霸幼儿园
"""

from indexing.models import ParsedSection

OUTLINE_SEPARATOR = "\n"


def build_outline(sections: list[ParsedSection]) -> str:
    """按文档顺序拼接去重后的标题路径。

    :param sections: 解析器输出段落
    :return: 每行一个标题路径的大纲文本，无标题时为空串
    """
    seen: list[str] = []
    for section in sections:
        path = (section.section_path or "").strip()
        if path and path not in seen:
            seen.append(path)
    return OUTLINE_SEPARATOR.join(seen)


def build_summary(title: str | None, sections: list[ParsedSection], body_chars: int) -> str:
    """生成确定性摘要：首行为标题，其后为去重的各级小标题与正文开头若干字。

    :param title: 实体标题
    :param sections: 解析器输出段落
    :param body_chars: 正文开头截取的字数
    :return: 摘要文本
    """
    headings: list[str] = []
    for section in sections:
        for part in (section.section_path or "").split(" / "):
            heading = part.strip()
            if heading and heading not in headings:
                headings.append(heading)
    body = "".join(section.text for section in sections)
    head = " ".join(body.split())[: max(0, body_chars)]
    lines = [_single_line(title)]
    if headings:
        lines.append(" ".join(headings))
    if head:
        lines.append(head)
    return OUTLINE_SEPARATOR.join(lines)


def replace_summary_title(summary: str | None, title: str | None) -> str:
    """只替换摘要首行的标题，保留小标题与正文部分。

    :param summary: 已存储的摘要
    :param title: 新标题
    :return: 替换标题后的摘要
    """
    current = summary or ""
    index = current.find(OUTLINE_SEPARATOR)
    rest = current[index:] if index >= 0 else ""
    return _single_line(title) + rest


def _single_line(value: str | None) -> str:
    return " ".join((value or "").split())
