package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Agent 运行结果数量。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Agent 运行结果数量")
public class AgentRunOutcomeCountVO {

    @Schema(description = "结果类型")
    private String outcome;

    @Schema(description = "运行次数")
    private Long count;
}
