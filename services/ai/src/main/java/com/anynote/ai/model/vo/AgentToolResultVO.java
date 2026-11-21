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
 * 工具结果摘要：计数与前 3 个结果条目。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "工具结果摘要")
public class AgentToolResultVO {

    @Schema(description = "结果计数")
    private Integer count;

    @Builder.Default
    @Schema(description = "结果条目，最多 3 项")
    private List<AgentToolResultItemVO> items = new ArrayList<>();
}
