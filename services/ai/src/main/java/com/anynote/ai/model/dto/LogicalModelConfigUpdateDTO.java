package com.anynote.ai.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 运行时逻辑模型配置更新请求（agent_main、fast、embedding）。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "运行时逻辑模型配置更新请求")
public class LogicalModelConfigUpdateDTO {

    /**
     * 绑定的模型供应商标识。
     */
    @Size(max = 64, message = "请求参数错误")
    @Schema(description = "模型供应商标识")
    private String providerKey;

    /**
     * 供应商侧模型名。
     */
    @Size(max = 128, message = "请求参数错误")
    @Schema(description = "供应商侧模型名称")
    private String model;

    /**
     * 期望向量维度（仅 embedding，1 到 2048），留空表示按模型实际输出自动探测。
     */
    @Schema(description = "向量维度（仅 embedding，1..2048，留空自动探测）")
    private Integer dimensions;

    /**
     * 推理输出格式。
     */
    @Pattern(regexp = "none|reasoning_content|reasoning|think_tag", message = "请求参数错误")
    @Schema(description = "推理输出格式：none / reasoning_content / reasoning / think_tag")
    private String reasoningFormat;

    /**
     * 同轮后续请求的推理回传方式。
     */
    @Pattern(regexp = "none|empty|original", message = "请求参数错误")
    @Schema(description = "推理回传方式：none 不回传 / empty 空字段 / original 原样回传")
    private String reasoningPassthrough;

    /**
     * 是否声明主模型支持 OpenAI 兼容图像输入。
     */
    @Schema(description = "是否声明支持 OpenAI 兼容图像输入，仅 agent_main 可开启")
    private Boolean supportsVision;

    /**
     * 是否启用该逻辑模型。
     */
    @NotNull(message = "请求参数错误")
    @Schema(description = "是否启用该逻辑模型", requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean enabled;
}
