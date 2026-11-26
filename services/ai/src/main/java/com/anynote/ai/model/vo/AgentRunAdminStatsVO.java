package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 管理端 Agent 运行聚合统计。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "管理端 Agent 运行聚合统计")
public class AgentRunAdminStatsVO {

    @Schema(description = "运行总数")
    private Long totalRuns;

    @Schema(description = "运行中次数")
    private Long runningRuns;

    @Schema(description = "成功完成次数")
    private Long succeededRuns;

    @Schema(description = "失败次数")
    private Long failedRuns;

    @Schema(description = "取消次数")
    private Long cancelledRuns;

    @Schema(description = "输入 token 总数")
    private Long promptTokens;

    @Schema(description = "输出 token 总数")
    private Long completionTokens;

    @Schema(description = "推理 token 总数")
    private Long reasoningTokens;

    @Schema(description = "合计 token 总数")
    private Long totalTokens;

    @Schema(description = "平均运行耗时（毫秒）")
    private Long avgDurationMs;

    @Schema(description = "P95 运行耗时（毫秒，nearest-rank）")
    private Long p95DurationMs;

    @Schema(description = "平均首字耗时（毫秒）")
    private Long avgFirstOutputMs;

    @Schema(description = "P95 首字耗时（毫秒，nearest-rank）")
    private Long p95FirstOutputMs;

    @Schema(description = "单次运行平均工具调用次数")
    private Double avgToolCalls;

    @Schema(description = "运行结果分布")
    private List<AgentRunOutcomeCountVO> outcomes;

    @Schema(description = "模型与供应商调用分布")
    private List<AgentRunModelBucketVO> models;

    @Schema(description = "按时间分桶趋势")
    private List<AgentRunTimeBucketVO> series;
}
