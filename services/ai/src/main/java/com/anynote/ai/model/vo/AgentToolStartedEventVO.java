package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * tool.started 事件数据：工具调用开始。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "tool.started 事件数据")
public class AgentToolStartedEventVO {

    @Schema(description = "工具调用标识")
    private String id;

    @Schema(description = "工具名")
    private String name;

    @Schema(description = "已确认的工具说明")
    private String summary;

    @Schema(description = "工具行对象")
    private AgentToolTargetVO target;
}
