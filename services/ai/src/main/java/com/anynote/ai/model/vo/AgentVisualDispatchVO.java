package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 一次模型请求实际发送的页面图像清单。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "一次模型请求实际发送的页面图像清单")
public class AgentVisualDispatchVO {

    @Schema(description = "图片发送批次标识")
    private String dispatchId;

    @Schema(description = "Agent 运行标识")
    private String runId;

    @Schema(description = "模型轮次")
    private Integer modelTurn;

    @Schema(description = "逻辑模型名")
    private String logicalModel;

    @Schema(description = "模型供应商标识")
    private String providerKey;

    @Schema(description = "供应商侧模型名")
    private String model;

    @Schema(description = "本次发送的页面图像元数据")
    private List<AgentVisualImageVO> images;
}
