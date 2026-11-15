package com.anynote.ai.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 知识检索运行范围。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "知识检索运行范围")
public class AgentRunScopeDTO {

    /**
     * 知识库标识列表。
     */
    @Builder.Default
    @Schema(description = "知识库标识列表")
    private List<Long> knowledgeBaseIds = new ArrayList<>();

    /**
     * 实体引用列表。
     */
    @Builder.Default
    @Schema(description = "实体引用列表")
    private List<String> refs = new ArrayList<>();
}
