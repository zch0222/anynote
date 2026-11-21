package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 模型 token 用量（usage 事件数据，也用于运行记录与管理端）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "模型 token 用量")
public class AgentUsageVO {

    @Schema(description = "输入 token 数")
    private Long promptTokens;

    @Schema(description = "输出 token 数")
    private Long completionTokens;

    @Schema(description = "合计 token 数")
    private Long totalTokens;

    @Schema(description = "推理 token 数")
    private Long reasoningTokens;

    @Schema(description = "用量是否已知")
    private Boolean known;
}
