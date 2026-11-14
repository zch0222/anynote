package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 源文档分页导出结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "源文档分页导出结果")
public class KnowledgeExportVO {

    private List<KnowledgeSourceDocumentVO> documents;
    private Long nextAfterId;
    private boolean hasMore;
}
