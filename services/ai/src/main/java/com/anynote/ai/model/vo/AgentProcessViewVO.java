package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 发给浏览器的过程视图：按读取时的权限复核后的思考、工具行、过程说明与重试行。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "Agent 运行过程视图")
public class AgentProcessViewVO {

    @Schema(description = "结构版本")
    private Integer version;

    @Schema(description = "运行耗时（毫秒）")
    private Long durationMs;

    @Schema(description = "是否因依赖不可读而隐藏了自由文本")
    private Boolean hidden;

    @Schema(description = "隐藏提示文案")
    private String hiddenNotice;

    @Schema(description = "模型发起的工具调用次数")
    private Integer toolCalls;

    @Schema(description = "从运行开始到首个思考或正文增量的毫秒数")
    private Long firstOutputMs;

    @Builder.Default
    @Schema(description = "过程行")
    private List<AgentProcessItemVO> items = new ArrayList<>();
}
