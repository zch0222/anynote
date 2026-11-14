package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * 结构化知识查询结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "结构化知识查询结果")
public class KnowledgeQueryVO {

    private List<Row> rows;
    private Long count;

    /**
     * 结构化查询行。
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "结构化查询行")
    public static class Row {
        private String ref;
        private String entityType;
        private String subtype;
        private Long kbId;
        private String parentRef;
        private String title;
        private Long createBy;
        private Date createTime;
        private Date updateTime;
        private Map<String, Object> attributes;
    }
}
