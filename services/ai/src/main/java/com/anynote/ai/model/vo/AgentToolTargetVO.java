package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 工具行对象：名称只取自可见集，resolved 表示是否已解析出名称。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "工具行对象")
public class AgentToolTargetVO {

    @Schema(description = "对象文字")
    private String label;

    @Schema(description = "是否已解析出名称")
    private Boolean resolved;
}
