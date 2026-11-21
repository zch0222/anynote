package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * reasoning.finished 事件数据：思考块结束。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "reasoning.finished 事件数据")
public class AgentReasoningFinishedEventVO {

    @Schema(description = "思考块标识")
    private String id;

    @Schema(description = "思考耗时（毫秒）")
    private Long durationMs;

    @Schema(description = "结束状态：done 或 interrupted")
    private String status;
}
