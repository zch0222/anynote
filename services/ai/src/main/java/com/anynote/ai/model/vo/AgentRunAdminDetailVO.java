package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * 管理端 Agent 运行详情：运行摘要与该运行落库的过程视图。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "管理端 Agent 运行详情")
public class AgentRunAdminDetailVO {

    @Schema(description = "运行摘要")
    private AgentRunAdminVO run;

    @Schema(description = "该运行落库的过程视图（用户实际看到的内容）")
    private Map<String, Object> process;
}
