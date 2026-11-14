package com.anynote.notify.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 知识库通知游标导出结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "知识库通知导出结果")
public class KnowledgeNoticeExportVO {

    private List<KnowledgeNoticeVO> documents;
    private Long nextAfterId;
    private boolean hasMore;
}
