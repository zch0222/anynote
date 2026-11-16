"""超长工具结果的结构化预览。

@author 称霸幼儿园
"""

import json
from typing import Any

OMITTED_KEY = "omitted"
OMITTED_HINT_KEY = "omittedHint"
OMITTED_HINT = "结果超出单次展示上限，各列表只保留了前面的条目，omitted 是省略的条数；需要其余条目时缩小条件、翻页或减少每页条数后再查。"


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _prior_omitted(value: dict[str, Any]) -> dict[str, int] | None:
    """取出上一次预览记下的省略条数，并从结果里移除两个保留字段。

    :param value: 解析后的结果对象
    :return: 省略条数；没有保留字段时为空字典，保留字段不是本模块写入的格式时为 None
    """
    if OMITTED_KEY not in value and OMITTED_HINT_KEY not in value:
        return {}
    omitted = value.pop(OMITTED_KEY, None)
    hint = value.pop(OMITTED_HINT_KEY, None)
    valid = (
        hint == OMITTED_HINT
        and isinstance(omitted, dict)
        and all(isinstance(count, int) and not isinstance(count, bool) and count >= 0 for count in omitted.values())
    )
    return dict(omitted) if valid else None


def structured_preview(content: str, budget: int) -> str | None:
    """把超长的 JSON 对象结果压成不超过预算的合法 JSON。

    标量与字符串列表等元数据（如 count、total、hasMore、notices）原样保留；由对象组成的列表按原顺序整条保留，
    放不下的条目整条省略，并在 ``omitted`` 里记下每个列表省略的条数。按字符截取会丢掉排在末尾的元数据、切断条目，
    而清单类结果的行只出现在工具结果里，丢了就看不到。

    对已经是预览的结果再次收缩时（上下文预算不足），沿用其中已省略的条数继续累加。

    :param content: 完整结果或上一次的预览
    :param budget: 预览的字符上限
    :return: 预览文本；结果不是 JSON 对象、没有对象列表、保留字段被工具自己占用或元数据本身超出预算时返回 None
    """
    try:
        value = json.loads(content)
    except ValueError:
        return None
    if not isinstance(value, dict):
        return None
    prior = _prior_omitted(value)
    if prior is None:
        return None
    lists = [
        key for key, item in value.items()
        if isinstance(item, list) and any(isinstance(entry, dict) for entry in item)
    ]
    if not lists and not prior:
        return None
    preview = {key: [] if key in lists else item for key, item in value.items()}
    omitted = dict(prior)
    for key in lists:
        omitted[key] = omitted.get(key, 0) + len(value[key])
    preview[OMITTED_KEY] = omitted
    preview[OMITTED_HINT_KEY] = OMITTED_HINT
    if len(_dumps(preview)) > budget:
        return None
    for key in lists:
        for item in value[key]:
            preview[key].append(item)
            omitted[key] -= 1
            if len(_dumps(preview)) > budget:
                preview[key].pop()
                omitted[key] += 1
                break
    for key in [key for key, count in omitted.items() if count == 0]:
        del omitted[key]
    if not omitted:
        del preview[OMITTED_KEY], preview[OMITTED_HINT_KEY]
    return _dumps(preview)
