package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 权威正文范围读取请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "权威正文范围读取请求")
public class KnowledgeContentDTO {

    @Schema(description = "基础实体标识")
    private String ref;
    @Schema(description = "慕课条目附属类型", allowableValues = {"transcript", "summary"})
    private String subtype;
    @Schema(description = "Markdown标题文本")
    private String heading;
    @Schema(description = "起始行，从1开始且包含")
    private Integer startLine;
    @Schema(description = "结束行，包含")
    private Integer endLine;
    @Schema(description = "字幕起始毫秒，包含")
    private Long startTimeMs;
    @Schema(description = "字幕结束毫秒，包含")
    private Long endTimeMs;
    @Schema(description = "选定范围内的字符偏移，从0开始")
    private Integer offset;
}
