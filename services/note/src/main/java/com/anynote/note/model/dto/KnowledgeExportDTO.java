package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 源文档导出请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "源文档导出请求")
public class KnowledgeExportDTO {

    @Schema(description = "实体类型", allowableValues = {"kb", "note", "doc", "mooc", "mooc_item", "transcript", "summary", "task"})
    private String entityType;
    @Schema(description = "知识库ID过滤")
    private Long kbId;
    @Schema(description = "上一页最后扫描的实体ID")
    private Long afterId;
    @Schema(description = "本轮扫描上限，默认100，最大200")
    private Integer limit;
}
