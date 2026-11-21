package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * run.finished 事件数据：运行终态、证据、回答标注、用量、工具调用次数、首字时间与总耗时。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "run.finished 事件数据")
public class AgentRunFinishedEventVO {

    @Schema(description = "终态")
    private String state;

    @Schema(description = "结果类型")
    private String outcome;

    @Schema(description = "本次运行的证据编号")
    private List<String> evidence;

    @Schema(description = "回答标注")
    private List<String> answerNotices;

    @Schema(description = "失败时未完成的修复提示")
    private List<String> unfinished;

    @Schema(description = "累计用量")
    private AgentUsageVO usage;

    @Schema(description = "模型发起的工具调用次数")
    private Integer toolCalls;

    @Schema(description = "从运行开始到首个思考或正文增量的毫秒数")
    private Long firstOutputMs;

    @Schema(description = "运行总耗时毫秒数，与运行记录及过程视图落库值一致")
    private Long durationMs;
}
