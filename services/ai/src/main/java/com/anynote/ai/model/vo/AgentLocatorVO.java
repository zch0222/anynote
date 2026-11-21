package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 证据在实体内的定位（引用与工具结果条目共用），只保留登记的定位字段。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "证据定位")
public class AgentLocatorVO {

    @Schema(description = "是否为清单、目录或关系结果中的一行")
    private Boolean row;

    @Schema(description = "起始片段序号")
    private Integer chunkStart;

    @Schema(description = "结束片段序号")
    private Integer chunkEnd;

    @Schema(description = "小节路径")
    private String sectionPath;

    @Schema(description = "起始页")
    private Integer pageStart;

    @Schema(description = "结束页")
    private Integer pageEnd;

    @Schema(description = "命中页")
    private Integer pageNo;

    @Schema(description = "片段起始毫秒")
    private Long startMs;

    @Schema(description = "片段结束毫秒")
    private Long endMs;

    @Schema(description = "起始行")
    private Integer startLine;

    @Schema(description = "结束行")
    private Integer endLine;

    @Schema(description = "命中行")
    private Integer line;

    @Schema(description = "续读偏移")
    private Integer offset;

    @Schema(description = "标题")
    private String heading;

    @Schema(description = "字幕起始毫秒")
    private Long startTimeMs;

    @Schema(description = "字幕结束毫秒")
    private Long endTimeMs;

    @Schema(description = "所属慕课标识")
    private Long moocId;
}
