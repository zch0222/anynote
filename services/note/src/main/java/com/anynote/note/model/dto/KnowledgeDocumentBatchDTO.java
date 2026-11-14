package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 按实体引用批量读取知识源文档请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "批量读取知识源文档请求")
public class KnowledgeDocumentBatchDTO {

    /**
     * 待读取的实体引用列表，如 note:1 或 mooc_item:5#transcript，最多 100 条。
     */
    @Schema(description = "待读取实体引用列表，最多100条")
    private List<String> refs;

    /**
     * 是否包含正文，默认 true。
     */
    @Schema(description = "是否包含正文，默认 true")
    private Boolean includeBody;
}
