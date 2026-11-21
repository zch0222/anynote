package com.anynote.ai.model.vo;

import com.anynote.ai.model.dto.AgentRunScopeDTO;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * run.started 事件数据：Agent、模型、检索范围、会话与索引状态。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "run.started 事件数据")
public class AgentRunStartedEventVO {

    @Schema(description = "Agent 名称")
    private String agent;

    @Schema(description = "Agent 版本")
    private String agentVersion;

    @Schema(description = "逻辑模型名")
    private String model;

    @Schema(description = "检索范围")
    private AgentRunScopeDTO scope;

    @Schema(description = "检索范围摘要")
    private String scopeSummary;

    @Schema(description = "会话标识")
    private Long conversationId;

    @Schema(description = "运行开始时的索引状态")
    private AgentIndexWatermarkVO indexWatermark;
}
