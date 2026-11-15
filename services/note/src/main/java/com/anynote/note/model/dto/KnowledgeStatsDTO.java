package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 知识库内容统计请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "知识库内容统计请求")
public class KnowledgeStatsDTO {

    @Schema(description = "显式知识库ID列表，为空时使用默认范围")
    private List<Long> knowledgeBaseIds;
}
