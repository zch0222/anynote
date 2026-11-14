package com.anynote.notify.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 按 id 批量读取知识库通知请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "批量读取知识库通知请求")
public class KnowledgeNoticeBatchDTO {

    /**
     * 待读取的知识库通知 id 列表，最多 100 条。
     */
    @Schema(description = "通知ID列表，最多100条")
    private List<Long> ids;
}
