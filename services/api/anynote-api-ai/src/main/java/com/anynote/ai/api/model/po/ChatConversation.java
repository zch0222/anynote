package com.anynote.ai.api.model.po;

import com.anynote.core.web.model.bo.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.*;

import java.util.Date;
import java.util.Map;

/**
 * AI 会话持久化实体。
 *
 * @author 称霸幼儿园
 */
@Data
@TableName("a_chat_conversation")
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
public class ChatConversation extends BaseEntity {
    /**
     * 对话id
     */
    private Long id;

    /**
     * 标题
     */
    private String title;

    /**
     * 对话类型0.文档rag
     */
    private Integer type;

    /**
     * 文档ID
     */
    private Long docId;

    /**
     * JSON 格式的知识检索范围。
     */
    private String scope;

    /**
     * 知识库id
     */
    private Long knowledgeBaseId;

    /**
     * 权限
     */
    private String permissions;

    /**
     * 删除标记 0.正常 1.删除
     */
    @TableLogic
    @TableField("is_delete")
    private Integer deleted;

    @Builder
    public ChatConversation(Long id, String title, Integer type, Long docId, Long knowledgeBaseId, Integer deleted,
                            Long createBy, Date createTime, Long updateBy, Date updateTime, String permissions,
                            String scope, String remark, Map<String, Object> params) {
        super(createBy, createTime, updateBy, updateTime, remark, params);
        this.id = id;
        this.title = title;
        this.type = type;
        this.docId = docId;
        this.scope = scope;
        this.knowledgeBaseId = knowledgeBaseId;
        this.deleted = deleted;
        this.permissions = permissions;
    }
}
