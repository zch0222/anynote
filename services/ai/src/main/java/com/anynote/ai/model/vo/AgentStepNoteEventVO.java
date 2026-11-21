package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * step.note 事件数据：工具轮里模型写的过程说明。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "step.note 事件数据")
public class AgentStepNoteEventVO {

    @Schema(description = "过程说明标识")
    private String id;

    @Schema(description = "过程说明")
    private String text;
}
