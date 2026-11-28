package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 按供应商与模型分组的运行统计。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "按供应商与模型分组的运行统计")
public class AgentRunModelBucketVO {

    @Schema(description = "供应商标识")
    private String provider;

    @Schema(description = "模型标识")
    private String model;

    @Schema(description = "运行次数")
    private Long runs;

    @Schema(description = "合计 token 数")
    private Long totalTokens;
}
