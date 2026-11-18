package com.anynote.ai.model.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * Agent 运行 Trace 管理端访问留痕（永久保留）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("a_agent_trace_access")
public class AgentTraceAccessPO {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String runId;

    private Long adminUserId;

    private Date createTime;
}
