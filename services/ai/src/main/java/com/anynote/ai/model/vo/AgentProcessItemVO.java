package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 过程视图中的一行，type 与 id 一起标识一行：思考（reasoning）、工具调用（tool）、过程说明（note）或重试（retry）。
 *
 * <p>思考行带 text、status、durationMs；工具行带 name、status、durationMs、target、result；
 * 过程说明行带 text；重试行只有 type 与 id。</p>
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "过程视图中的一行")
public class AgentProcessItemVO {

    @Schema(description = "行类型", allowableValues = {"reasoning", "tool", "note", "retry"})
    private String type;

    @Schema(description = "行标识：思考块、工具调用、过程说明或重试的标识")
    private String id;

    @Schema(description = "思考或过程说明的文字；回放隐藏时为空")
    private String text;

    @Schema(description = "状态：思考行为 streaming、done 或 interrupted，工具行为 running、SUCCESS、PARTIAL 或 FAILED")
    private String status;

    @Schema(description = "耗时（毫秒）")
    private Long durationMs;

    @Schema(description = "工具名")
    private String name;

    @Schema(description = "工具行对象")
    private AgentToolTargetVO target;

    @Schema(description = "工具结果摘要")
    private AgentToolResultVO result;
}
