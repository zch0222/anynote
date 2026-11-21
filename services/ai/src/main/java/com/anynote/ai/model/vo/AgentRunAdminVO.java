package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 管理端 Agent 运行列表行。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "管理端 Agent 运行列表行")
public class AgentRunAdminVO {

    @Schema(description = "运行标识")
    private String runId;

    @Schema(description = "会话标识")
    private Long conversationId;

    @Schema(description = "用户标识")
    private Long userId;

    @Schema(description = "Agent 名称")
    private String agentName;

    @Schema(description = "Agent 版本")
    private String agentVersion;

    @Schema(description = "逻辑模型名")
    private String model;

    @Schema(description = "逻辑模型绑定的供应商标识")
    private String provider;

    @Schema(description = "运行状态")
    private String state;

    @Schema(description = "结果类型")
    private String outcome;

    @Schema(description = "Token 用量")
    private AgentUsageVO tokenUsage;

    @Schema(description = "模型发起的工具调用次数")
    private Integer toolCalls;

    @Schema(description = "从运行开始到首个思考或正文增量的毫秒数")
    private Long firstOutputMs;

    @Schema(description = "运行耗时（毫秒）")
    private Long durationMs;

    @Schema(description = "开始时间")
    private Date startedAt;

    @Schema(description = "结束时间")
    private Date finishedAt;
}
