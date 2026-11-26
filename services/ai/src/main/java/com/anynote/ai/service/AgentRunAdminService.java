package com.anynote.ai.service;

import com.anynote.ai.model.vo.AgentRunAdminDetailVO;
import com.anynote.ai.model.vo.AgentRunAdminEventVO;
import com.anynote.ai.model.vo.AgentRunAdminStatsVO;
import com.anynote.ai.model.vo.AgentRunAdminVO;
import com.anynote.core.web.model.bo.PageBean;

import java.util.List;

/**
 * 管理端 Agent 运行与 Trace 查询服务（仅系统管理员）。
 *
 * @author 称霸幼儿园
 */
public interface AgentRunAdminService {

    /**
     * 分页查询运行列表。
     *
     * @param pageNum 页码，从 1 起
     * @param pageSize 每页条数
     * @param userId 用户标识筛选，可空
     * @param runId 运行标识前缀筛选，可空
     * @param outcome 结果类型筛选，可空
     * @param startedFrom 开始时间下界，可空
     * @param startedTo 开始时间上界，可空
     * @return 分页运行列表
     */
    PageBean<AgentRunAdminVO> listRuns(int pageNum, int pageSize, Long userId, String runId,
                                       String outcome, String startedFrom, String startedTo);

    /**
     * 查询时间范围内的运行聚合统计。
     *
     * @param startedFrom 开始时间下界，可空
     * @param startedTo 开始时间上界，可空
     * @param granularity 时间桶粒度，可空
     * @return 聚合统计
     */
    AgentRunAdminStatsVO getStats(String startedFrom, String startedTo, String granularity);

    /**
     * 查询运行详情（摘要与落库的过程视图），并写一条访问留痕。
     *
     * @param runId 运行标识
     * @param adminUserId 查看的管理员标识
     * @return 运行详情
     */
    AgentRunAdminDetailVO getRun(String runId, Long adminUserId);

    /**
     * 按 seq 游标分页读取完整 Trace，并写一条访问留痕。
     *
     * @param runId 运行标识
     * @param afterSeq 起始序号（不含），首页传 0
     * @param limit 单页条数
     * @param adminUserId 查看的管理员标识
     * @return 事件列表
     */
    List<AgentRunAdminEventVO> listEvents(String runId, long afterSeq, int limit, Long adminUserId);
}
