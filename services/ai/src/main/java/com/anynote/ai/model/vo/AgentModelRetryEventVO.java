package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * model.retry 事件数据：已输出的思考因模型重试而中断。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "model.retry 事件数据")
public class AgentModelRetryEventVO {

    @Schema(description = "重试行标识")
    private String id;

    @Schema(description = "即将开始的尝试序号")
    private Integer attempt;
}
