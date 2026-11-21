package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * tool.finished 事件数据：工具调用结束。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "tool.finished 事件数据")
public class AgentToolFinishedEventVO {

    @Schema(description = "工具调用标识")
    private String id;

    @Schema(description = "工具名")
    private String name;

    @Schema(description = "调用状态：SUCCESS、PARTIAL 或 FAILED")
    private String status;

    @Schema(description = "本次调用登记的证据数")
    private Integer hitCount;

    @Schema(description = "耗时（毫秒）")
    private Long durationMs;

    @Schema(description = "错误类别")
    private String errorCategory;

    @Schema(description = "是否可重试")
    private Boolean retryable;

    @Schema(description = "工具行对象")
    private AgentToolTargetVO target;

    @Schema(description = "结果摘要，失败时为空")
    private AgentToolResultVO result;
}
