package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Harness 运行事件信封。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Agent 运行事件信封")
public class AgentRunEventVO {

    /**
     * 本次运行内递增的事件序号。
     */
    @Schema(description = "本次运行内递增的事件序号")
    private Long seq;

    /**
     * 运行标识。
     */
    @Schema(description = "运行标识")
    private String runId;

    /**
     * 事件时间。
     */
    @Schema(description = "事件时间")
    private String ts;

    /**
     * 事件类型。
     */
    @Schema(description = "事件类型")
    private String type;

    /**
     * 事件数据，按事件类型对应一个数据类（如 AgentToolStartedEventVO）。
     */
    @Schema(description = "事件数据，结构按事件类型对应 Agent*EventVO 等命名 schema")
    private Object data;
}
