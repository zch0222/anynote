"""会话历史压缩。

@author 称霸幼儿园
"""

from harness.models import ChatMessage, RunContext, TokenUsage
from models.base import ChatModel


class HistoryCompactor:
    """使用 fast 模型压缩较早历史。

    @author 称霸幼儿园
    """

    def __init__(self, model: ChatModel):
        self._model = model

    async def compact(
        self,
        run: RunContext,
        older: list[ChatMessage],
    ) -> tuple[ChatMessage, TokenUsage]:
        """生成一条结构化历史摘要。

        :param run: 当前运行
        :param older: 需要压缩的较早消息
        :return: 摘要消息与模型用量
        """
        source = "\n".join(f"{message.role}: {message.content}" for message in older)
        messages = [
            {
                "role": "system",
                "content": "将对话历史压缩为结构化摘要，保留用户目标、已确认事实及其出处、被否定的方向。",
            },
            {"role": "user", "content": source},
        ]
        text = []
        usage = TokenUsage()
        async for chunk in self._model.stream(
            run.agent.compact_model,
            run.model_snapshot,
            messages,
            [],
            run.runtime,
            True,
        ):
            if chunk.text_delta:
                text.append(chunk.text_delta)
            if chunk.usage:
                usage = usage.plus(chunk.usage)
        return ChatMessage(role="user", content=f"[历史摘要]\n{''.join(text)}"), usage
