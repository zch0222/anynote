package com.anynote.ai.model.vo;

import com.google.gson.Gson;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 会话详情响应对象。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "AI 会话详情")
public class ChatConversationDetailVO {

    private ChatConversationInfoVO conversation;

    private List<ChatMessageVO> messages;

    /**
     * 将内部会话对象转换为结构化响应。
     *
     * @param source 内部会话对象
     * @param gson JSON 解析器
     * @return 会话详情响应
     */
    public static ChatConversationDetailVO from(ChatConversationVO source, Gson gson) {
        List<ChatMessageVO> messages = source.getMessages() == null
                ? List.of()
                : source.getMessages().stream()
                .map(message -> ChatMessageVO.from(message, gson))
                .toList();
        return ChatConversationDetailVO.builder()
                .conversation(source.getConversation())
                .messages(messages)
                .build();
    }
}
