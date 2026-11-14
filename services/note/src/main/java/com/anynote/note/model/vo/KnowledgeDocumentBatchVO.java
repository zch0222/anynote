package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 批量读取知识源文档结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "批量读取知识源文档结果")
public class KnowledgeDocumentBatchVO {

    /**
     * 命中的权威源文档列表。
     */
    @Schema(description = "命中的源文档列表")
    private List<KnowledgeSourceDocumentVO> documents;

    /**
     * 未命中或已删除的实体引用列表。
     */
    @Schema(description = "未命中或已删除的实体引用列表")
    private List<String> missingRefs;
}
