package com.anynote.note.model.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 知识实体变更记录。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("n_knowledge_change")
public class KnowledgeChangePO {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String entityType;
    private Long entityId;
    private Long knowledgeBaseId;
    private String operation;
    private Date createTime;
}
