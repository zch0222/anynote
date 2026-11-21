package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/**
 * Agent 运行状态与最终结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Agent 运行状态与结果")
public class AgentRunStatusVO {

    @Schema(description = "运行标识")
    private String runId;

    @Schema(description = "会话标识")
    private Long conversationId;

    @Schema(description = "运行状态")
    private String state;

    @Schema(description = "结果类型")
    private String outcome;

    @Schema(description = "最终回答")
    private String answer;

    @Schema(description = "结构化引用")
    private List<AgentCitationVO> citations;

    @Schema(description = "Token 用量")
    private AgentUsageVO usage;

    @Schema(description = "开始时间")
    private Instant startedAt;

    @Schema(description = "结束时间")
    private Instant finishedAt;
}
