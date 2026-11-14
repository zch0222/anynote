package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 运行时 Embedding 逻辑模型配置视图。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "运行时 Embedding 模型配置")
public class EmbeddingModelConfigVO {

    @Schema(description = "逻辑模型用途名称")
    private String logicalName;

    @Schema(description = "绑定的模型供应商标识")
    private String providerKey;

    @Schema(description = "Embedding 模型名称")
    private String model;

    @Schema(description = "向量维度（1..2048，为空时自动探测）")
    private Integer dimensions;

    @Schema(description = "是否启用向量索引")
    private Boolean enabled;

    @Schema(description = "配置版本号")
    private Long version;

    @Schema(description = "最近更新时间")
    private Date updateTime;
}
