package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Agent 运行取消结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Agent 运行取消结果")
public class AgentRunCancelVO {

    @Schema(description = "运行标识")
    private String runId;

    @Schema(description = "是否受理取消")
    private boolean accepted;

    @Schema(description = "运行状态")
    private String state;
}
