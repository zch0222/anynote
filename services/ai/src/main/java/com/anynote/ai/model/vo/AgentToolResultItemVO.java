package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 工具结果条目：实体键、标题、所属知识库与定位。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "工具结果条目")
public class AgentToolResultItemVO {

    @Schema(description = "实体键，如 note:12 或 mooc_item:5#transcript")
    private String ref;

    @Schema(description = "标题")
    private String title;

    @Schema(description = "所属知识库名称")
    private String kbName;

    @Schema(description = "所属知识库标识")
    private Long kbId;

    @Schema(description = "定位")
    private AgentLocatorVO locator;
}
