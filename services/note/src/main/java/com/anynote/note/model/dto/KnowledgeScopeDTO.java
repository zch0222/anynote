package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 检索范围请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "检索范围请求")
public class KnowledgeScopeDTO {

    @Schema(description = "显式知识库ID列表")
    private List<Long> knowledgeBaseIds;

    @Schema(description = "显式实体标识列表")
    private List<String> refs;
}
