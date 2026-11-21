package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 回答引用（citation 事件数据，也是落库与会话详情中的引用）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "回答引用")
public class AgentCitationVO {

    @Schema(description = "引用编号，从 1 起")
    private Integer index;

    @Schema(description = "证据编号")
    private String evidenceId;

    @Schema(description = "来源类型")
    private String sourceType;

    @Schema(description = "来源实体键，如 note:12 或 mooc_item:5#transcript")
    private String sourceId;

    @Schema(description = "来源标题")
    private String title;

    @Schema(description = "定位")
    private AgentLocatorVO locator;

    @Schema(description = "原文片段")
    private String snippet;

    @Schema(description = "证据是否已过期")
    private Boolean stale;

    @Schema(description = "来源权威性")
    private String authority;

    @Schema(description = "所属知识库标识")
    private Long kbId;

    @Schema(description = "所属知识库名称")
    private String kbName;

    @Schema(description = "可读依据")
    private String permissionBasis;
}
