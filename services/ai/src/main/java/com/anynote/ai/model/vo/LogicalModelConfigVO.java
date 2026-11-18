package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 运行时逻辑模型配置视图（agent_main、fast、embedding）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "运行时逻辑模型配置")
public class LogicalModelConfigVO {

    @Schema(description = "逻辑模型用途名称")
    private String logicalName;

    @Schema(description = "绑定的模型供应商标识")
    private String providerKey;

    @Schema(description = "供应商侧模型名称")
    private String model;

    @Schema(description = "向量维度（仅 embedding，1..2048，为空时自动探测）")
    private Integer dimensions;

    @Schema(description = "推理输出格式：none / reasoning_content / reasoning / think_tag",
            allowableValues = {"none", "reasoning_content", "reasoning", "think_tag"})
    private String reasoningFormat;

    @Schema(description = "推理回传方式：none 不回传 / empty 空字段 / original 原样回传",
            allowableValues = {"none", "empty", "original"})
    private String reasoningPassthrough;

    @Schema(description = "是否启用该逻辑模型")
    private Boolean enabled;

    @Schema(description = "配置版本号")
    private Long version;

    @Schema(description = "最近更新时间")
    private Date updateTime;
}
