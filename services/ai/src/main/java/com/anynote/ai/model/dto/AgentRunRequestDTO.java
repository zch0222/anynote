package com.anynote.ai.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 知识检索运行请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "知识检索运行请求")
public class AgentRunRequestDTO {

    /**
     * 可继续使用的会话标识。
     */
    @Schema(description = "可继续使用的会话标识")
    private Long conversationId;

    /**
     * 本轮用户问题。
     */
    @NotBlank
    @Schema(description = "本轮用户问题", requiredMode = Schema.RequiredMode.REQUIRED)
    private String input;

    /**
     * Agent 名称。
     */
    @Builder.Default
    @Schema(description = "Agent 名称", defaultValue = "knowledge-retrieval")
    private String agent = "knowledge-retrieval";

    /**
     * 本轮检索范围。
     */
    @Valid
    @Schema(description = "本轮检索范围；省略时沿用会话范围或默认范围")
    private AgentRunScopeDTO scope;

    /**
     * 模型覆盖名称。
     */
    @Schema(description = "模型覆盖名称")
    private String model;
}
