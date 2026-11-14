package com.anynote.notify.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 按 id 批量读取知识库通知结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "批量读取知识库通知结果")
public class KnowledgeNoticeBatchVO {

    private List<KnowledgeNoticeVO> documents;
    private List<Long> missingIds;
}
