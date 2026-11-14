package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 知识目录与大纲请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "知识目录与大纲请求")
public class KnowledgeOutlineDTO {

    @Schema(description = "知识库、慕课、笔记或条目标识")
    private String ref;
    @Schema(description = "慕课条目父级ID，缺省为0")
    private Long parentId;
    @Schema(description = "页码，从1开始")
    private Integer pageNum;
    @Schema(description = "每页数量，最大100")
    private Integer pageSize;
}
