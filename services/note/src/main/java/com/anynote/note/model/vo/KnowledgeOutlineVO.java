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
 * 知识目录或大纲分页结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "知识目录或大纲分页结果")
public class KnowledgeOutlineVO {

    private String ref;
    private List<Node> nodes;
    private Integer pageNum;
    private Integer pageSize;
    private Long total;
    private boolean hasMore;

    /**
     * 目录节点。
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "目录节点")
    public static class Node {
        private String ref;
        private String entityType;
        private String title;
        private String parentRef;
        private Map<String, Object> locator;
        private Date updateTime;
    }
}
