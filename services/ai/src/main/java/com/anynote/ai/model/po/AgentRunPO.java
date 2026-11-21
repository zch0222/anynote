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
 * Agent 运行记录。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("a_agent_run")
public class AgentRunPO {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String runId;

    private Long conversationId;

    private Long userId;

    private String agentName;

    private String agentVersion;

    private String model;

    /**
     * 逻辑模型绑定的供应商标识。
     */
    private String provider;

    private String state;

    private String outcome;

    private String tokenUsage;

    private Long durationMs;

    /**
     * 模型发起的工具调用次数。
     */
    private Integer toolCalls;

    /**
     * 从运行开始到首个思考或正文增量的毫秒数。
     */
    private Long firstOutputMs;

    private Date startedAt;

    private Date finishedAt;
}
