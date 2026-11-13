package com.anynote.ai.run;

import com.anynote.ai.api.enums.ChatCompletionsVOStatus;
import com.anynote.ai.api.model.vo.ChatCompletionsVO;
import com.anynote.ai.harness.vo.FastApiChatCompletionsVO;

/**
 * 对话流式转发的累积器：把上游增量拼成落库正文，并生成发给浏览器的帧。
 *
 * @author 称霸幼儿园
 */
public class ChatStreamAccumulator {

    /**
     * 上游失败时追加到正文末尾的提示，保持改造前的行为。
     */
    public static final String FAILED_MESSAGE = "出现异常请稍后重试";

    private final Long conversationId;

    private final StringBuilder content = new StringBuilder();

    public ChatStreamAccumulator(Long conversationId) {
        this.conversationId = conversationId;
    }

    /**
     * 处理一个上游增量，返回发给浏览器的成功帧。
     *
     * @param chunk 上游增量
     * @return 浏览器事件数据
     */
    public ChatCompletionsVO onChunk(FastApiChatCompletionsVO chunk) {
        String delta = extractDelta(chunk);
        content.append(delta);
        return ChatCompletionsVO.builder()
                .status(ChatCompletionsVOStatus.SUCCESS.name().toLowerCase())
                .message(delta)
                .conversationId(conversationId)
                .build();
    }

    /**
     * 处理上游失败，返回发给浏览器的失败帧。
     *
     * @return 浏览器事件数据
     */
    public ChatCompletionsVO onFailure() {
        content.append('\n').append(FAILED_MESSAGE);
        return ChatCompletionsVO.builder()
                .status(ChatCompletionsVOStatus.FAILED.name().toLowerCase())
                .message(FAILED_MESSAGE)
                .conversationId(conversationId)
                .build();
    }

    /**
     * 已累积的回答正文。
     *
     * @return 正文
     */
    public String getContent() {
        return content.toString();
    }

    private String extractDelta(FastApiChatCompletionsVO chunk) {
        if (chunk == null || chunk.getChoices() == null || chunk.getChoices().isEmpty()) {
            return "";
        }
        FastApiChatCompletionsVO.Choice choice = chunk.getChoices().get(0);
        if (choice == null || choice.getDelta() == null || choice.getDelta().getContent() == null) {
            return "";
        }
        return choice.getDelta().getContent();
    }
}
