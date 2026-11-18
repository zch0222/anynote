package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 管理端 Agent 运行事件（完整 Trace 的一页）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "管理端 Agent 运行事件")
public class AgentRunAdminEventVO {

    @Schema(description = "事件序号")
    private Long seq;

    @Schema(description = "事件类型")
    private String type;

    @Schema(description = "事件数据（JSON）")
    private Object content;

    @Schema(description = "记录时间")
    private Date createTime;
}
