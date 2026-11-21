package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * error 事件数据：运行错误。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "error 事件数据")
public class AgentErrorEventVO {

    @Schema(description = "错误类别")
    private String category;

    @Schema(description = "是否可重试")
    private Boolean retryable;

    @Schema(description = "已确认的错误文案")
    private String message;
}
