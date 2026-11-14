package com.anynote.notify.model.po;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 知识库通知导出映射对象。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeNoticeExportPO {

    private Long id;
    private String title;
    private String content;
    private Integer type;
    private Integer status;
    private Integer level;
    private Integer deleted;
    private Long knowledgeBaseId;
    private Long createBy;
    private Date createTime;
    private Long updateBy;
    private Date updateTime;
}
