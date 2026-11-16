package com.anynote.ai.model.vo;

import com.anynote.ai.api.model.po.ChatMessage;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.lang.reflect.Type;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * 会话消息响应对象，将 JSON 引用与回答标注转换为结构化数组。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "会话消息")
public class ChatMessageVO {

    private Long id;

    private Long conversationId;

    private Integer orderIndex;

    private String content;

    private String runId;

    @Schema(description = "结构化引用")
    private List<Map<String, Object>> citations;

    @Schema(description = "回答标注")
    private List<String> answerNotices;

    private String outcome;

    private int role;

    private int type;

    private Long docId;

    private int deleted;

    private Long createBy;

    private Date createTime;

    private Long updateBy;

    private Date updateTime;

    private String remark;

    private static final Type CITATIONS_TYPE = new TypeToken<List<Map<String, Object>>>() { }.getType();

    private static final Type ANSWER_NOTICES_TYPE = new TypeToken<List<String>>() { }.getType();

    /**
     * 将持久化消息转换为接口消息。
     *
     * @param message 持久化消息
     * @param gson JSON 解析器
     * @return 接口消息
     */
    public static ChatMessageVO from(ChatMessage message, Gson gson) {
        List<Map<String, Object>> citations = List.of();
        if (message.getCitations() != null && !message.getCitations().isBlank()) {
            try {
                List<Map<String, Object>> parsed = gson.fromJson(message.getCitations(), CITATIONS_TYPE);
                if (parsed != null) {
                    citations = parsed;
                }
            } catch (RuntimeException ignored) {
                // 历史消息的非 JSON 引用按空数组返回。
            }
        }
        List<String> answerNotices = List.of();
        if (message.getAnswerNotices() != null && !message.getAnswerNotices().isBlank()) {
            try {
                List<String> parsed = gson.fromJson(message.getAnswerNotices(), ANSWER_NOTICES_TYPE);
                if (parsed != null) {
                    answerNotices = parsed;
                }
            } catch (RuntimeException ignored) {
                // 历史消息的非 JSON 标注按空数组返回。
            }
        }
        return ChatMessageVO.builder()
                .id(message.getId())
                .conversationId(message.getConversationId())
                .orderIndex(message.getOrderIndex())
                .content(message.getContent())
                .runId(message.getRunId())
                .citations(citations)
                .answerNotices(answerNotices)
                .outcome(message.getOutcome())
                .role(message.getRole())
                .type(message.getType())
                .docId(message.getDocId())
                .deleted(message.getDeleted())
                .createBy(message.getCreateBy())
                .createTime(message.getCreateTime())
                .updateBy(message.getUpdateBy())
                .updateTime(message.getUpdateTime())
                .remark(message.getRemark())
                .build();
    }
}
