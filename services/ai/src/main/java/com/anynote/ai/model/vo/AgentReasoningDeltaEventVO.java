package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * reasoning.delta 事件数据：同一思考块合并后的思考增量。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "reasoning.delta 事件数据")
public class AgentReasoningDeltaEventVO {

    @Schema(description = "思考块标识")
    private String id;

    @Schema(description = "思考增量")
    private String delta;
}
