package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 结构化知识查询请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "结构化知识查询请求")
public class KnowledgeQueryDTO {

    @Schema(description = "实体类型", allowableValues = {"kb", "note", "doc", "mooc", "mooc_item", "transcript", "summary", "task"})
    private String entity;
    @Schema(description = "命名查询", allowableValues = {"MY_TASKS"})
    private String queryName;
    @Schema(description = "显式知识库ID列表")
    private List<Long> kbIds;
    @Schema(description = "白名单过滤参数")
    private Map<String, Object> filters;
    @Schema(description = "排序，格式为字段:asc或字段:desc")
    private String sort;
    @Schema(description = "最多返回数量，默认20，最大100")
    private Integer limit;
    @Schema(description = "是否返回权限过滤后的总数")
    private Boolean withCount;
}
