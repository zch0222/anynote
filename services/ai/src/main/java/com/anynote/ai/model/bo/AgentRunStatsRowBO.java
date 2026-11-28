package com.anynote.ai.model.bo;

import lombok.Data;

import java.util.Date;

/**
 * 管理端 Agent 运行统计查询行。
 *
 * @author 称霸幼儿园
 */
@Data
public class AgentRunStatsRowBO {

    private String provider;

    private String model;

    private String state;

    private String outcome;

    private String tokenUsage;

    private Long durationMs;

    private Integer toolCalls;

    private Long firstOutputMs;

    private Date startedAt;
}
