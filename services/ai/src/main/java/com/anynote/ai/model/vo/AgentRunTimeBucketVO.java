package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 按时间分桶的 Agent 运行统计。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "按时间分桶的 Agent 运行统计")
public class AgentRunTimeBucketVO {

    @Schema(description = "时间桶开始时间")
    private Date bucketStart;

    @Schema(description = "运行次数")
    private Long totalRuns;

    @Schema(description = "成功完成次数")
    private Long succeededRuns;

    @Schema(description = "失败次数")
    private Long failedRuns;

    @Schema(description = "合计 token 数")
    private Long totalTokens;

    @Schema(description = "平均运行耗时（毫秒）")
    private Long avgDurationMs;
}
