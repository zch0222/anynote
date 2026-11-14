package com.anynote.notify.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 知识库通知游标导出请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "知识库通知导出请求")
public class KnowledgeNoticeExportDTO {

    /**
     * 上一页最后扫描的通知 id，默认 0。
     */
    @Schema(description = "上一页最后扫描的通知ID")
    private Long afterId;

    /**
     * 本轮扫描上限，默认 100，最大 200。
     */
    @Schema(description = "本轮扫描上限，默认100，最大200")
    private Integer limit;
}
