package com.anynote.ai.api.model.po;

import com.anynote.core.web.model.bo.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.*;

import java.util.Date;
import java.util.Map;

/**
 * AI 会话消息持久化实体。
 *
 * @author 称霸幼儿园
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("a_chat_message")
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage extends BaseEntity {

    /**
     * Message ID.
     */
    private Long id;

    /**
     * Conversation ID.
     */
    private Long conversationId;

    /**
     * Order index.
     */
    private Integer orderIndex;

    /**
     * Message content.
     */
    private String content;

    /**
     * 关联的 Agent 运行标识。
     */
    private String runId;

    /**
     * JSON 格式的结构化引用。
     */
    private String citations;

    /**
     * JSON 格式的回答标注。
     */
    private String answerNotices;

    /**
     * Agent 运行结果类型。
     */
    private String outcome;

    /**
     * JSON 格式的过程视图（思考、工具行、过程说明与依赖清单）。
     */
    private String process;

    /**
     * Role: 0 for user, 1 for bot.
     */
    private int role;

    /**
     * Type: 0 for document rag. 1. Chat
     */
    private int type;

    /**
     * Document ID.
     */
    private Long docId;

    /**
     * Deletion flag: 0 for normal, 1 for deleted.
     */
    @TableLogic
    @TableField("is_delete")
    private int deleted;

    @Builder
    public ChatMessage(Long id, Long conversationId, Integer orderIndex, String content, int role, int type,
                       String runId, String citations, String answerNotices, String outcome, Long docId, int deleted,
                       Long createBy, Date createTime, Long updateBy, Date updateTime, String remark,
                       Map<String, Object> params) {
        super(createBy, createTime, updateBy, updateTime, remark, params);
        this.id = id;
        this.conversationId = conversationId;
        this.orderIndex = orderIndex;
        this.content = content;
        this.runId = runId;
        this.citations = citations;
        this.answerNotices = answerNotices;
        this.outcome = outcome;
        this.role = role;
        this.type = type;
        this.docId = docId;
        this.deleted = deleted;

    }

}
