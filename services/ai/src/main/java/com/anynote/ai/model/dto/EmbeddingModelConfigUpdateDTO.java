package com.anynote.ai.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 运行时 Embedding 逻辑模型配置更新请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "运行时 Embedding 模型配置更新请求")
public class EmbeddingModelConfigUpdateDTO {

    /**
     * 绑定的模型供应商标识。
     */
    @Size(max = 64, message = "请求参数错误")
    @Schema(description = "模型供应商标识")
    private String providerKey;

    /**
     * 供应商侧 Embedding 模型名。
     */
    @Size(max = 128, message = "请求参数错误")
    @Schema(description = "Embedding 模型名称")
    private String model;

    /**
     * 期望向量维度（1 到 2048），留空表示按模型实际输出自动探测。
     */
    @Schema(description = "向量维度（1..2048，留空自动探测）")
    private Integer dimensions;

    /**
     * 是否启用向量索引。
     */
    @NotNull(message = "请求参数错误")
    @Schema(description = "是否启用向量索引", requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean enabled;
}
