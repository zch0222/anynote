package com.anynote.ai.controller;

import com.anynote.ai.model.vo.AgentRunAdminDetailVO;
import com.anynote.ai.model.vo.AgentRunAdminEventVO;
import com.anynote.ai.model.vo.AgentRunAdminStatsVO;
import com.anynote.ai.model.vo.AgentRunAdminVO;
import com.anynote.ai.security.SystemAdminGuard;
import com.anynote.ai.service.AgentRunAdminService;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.model.bo.LoginUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 系统管理员的 Agent 运行轨迹控制台端点。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "Agent 运行轨迹管理", description = "仅系统管理员可查看运行与完整 Trace")
@RestController
@RequestMapping("/v1/admin/agent-runs")
public class AgentRunAdminController {

    private final AgentRunAdminService agentRunAdminService;

    private final SystemAdminGuard systemAdminGuard;

    /**
     * 构造器注入。
     *
     * @param agentRunAdminService 管理端运行查询服务
     * @param systemAdminGuard 系统管理员准入组件
     */
    public AgentRunAdminController(AgentRunAdminService agentRunAdminService,
                                    SystemAdminGuard systemAdminGuard) {
        this.agentRunAdminService = agentRunAdminService;
        this.systemAdminGuard = systemAdminGuard;
    }

    /**
     * 分页查询 Agent 运行列表。
     *
     * @param pageNum 页码，从 1 起
     * @param pageSize 每页条数
     * @param userId 用户标识筛选，可空
     * @param runId 运行标识前缀筛选，可空
     * @param outcome 结果类型筛选，可空
     * @param startedFrom 开始时间下界（ISO-8601），可空
     * @param startedTo 开始时间上界（ISO-8601），可空
     * @return 分页运行列表
     */
    @Operation(summary = "查询 Agent 运行列表", description = "按用户、时间、结果与运行标识筛选")
    @GetMapping
    public ResData<PageBean<AgentRunAdminVO>> listRuns(
            @Parameter(description = "页码") @RequestParam(defaultValue = "1") int pageNum,
            @Parameter(description = "每页条数，上限 100") @RequestParam(defaultValue = "20") int pageSize,
            @Parameter(description = "用户标识") @RequestParam(required = false) Long userId,
            @Parameter(description = "运行标识前缀") @RequestParam(required = false) String runId,
            @Parameter(description = "结果类型") @RequestParam(required = false) String outcome,
            @Parameter(description = "开始时间下界") @RequestParam(required = false) String startedFrom,
            @Parameter(description = "开始时间上界") @RequestParam(required = false) String startedTo) {
        systemAdminGuard.requireAdmin();
        return ResUtil.success(agentRunAdminService.listRuns(
                pageNum, pageSize, userId, runId, outcome, startedFrom, startedTo));
    }

    /**
     * 查询时间范围内的 Agent 运行聚合统计。
     *
     * @param startedFrom 开始时间下界（ISO-8601），可空
     * @param startedTo 开始时间上界（ISO-8601），可空
     * @param granularity 时间桶粒度（HOUR 或 DAY），可空
     * @return 聚合统计
     */
    @Operation(summary = "查询 Agent 运行聚合统计", description = "按时间范围汇总运行状态、Token、耗时、模型分布与时间序列")
    @GetMapping("/stats")
    public ResData<AgentRunAdminStatsVO> getStats(
            @Parameter(description = "开始时间下界") @RequestParam(required = false) String startedFrom,
            @Parameter(description = "开始时间上界") @RequestParam(required = false) String startedTo,
            @Parameter(description = "时间桶粒度") @RequestParam(required = false) String granularity) {
        systemAdminGuard.requireAdmin();
        return ResUtil.success(agentRunAdminService.getStats(startedFrom, startedTo, granularity));
    }

    /**
     * 查询运行详情与用户实际看到的过程视图。
     *
     * @param runId 运行标识
     * @return 运行详情
     */
    @Operation(summary = "查询运行详情", description = "返回运行摘要与该运行落库的过程视图；每次调用写访问留痕")
    @GetMapping("/{runId}")
    public ResData<AgentRunAdminDetailVO> getRun(
            @Parameter(description = "运行标识") @PathVariable String runId) {
        LoginUser admin = systemAdminGuard.requireAdmin();
        return ResUtil.success(agentRunAdminService.getRun(runId, admin.getUserId()));
    }

    /**
     * 按 seq 游标分页读取完整 Trace。
     *
     * @param runId 运行标识
     * @param afterSeq 起始序号（不含），首页传 0
     * @param limit 单页条数，默认 100、上限 500
     * @return 事件列表
     */
    @Operation(summary = "读取完整 Trace", description = "按 seq 游标分页；每次调用写访问留痕")
    @GetMapping("/{runId}/events")
    public ResData<List<AgentRunAdminEventVO>> listEvents(
            @Parameter(description = "运行标识") @PathVariable String runId,
            @Parameter(description = "起始序号") @RequestParam(defaultValue = "0") long afterSeq,
            @Parameter(description = "单页条数") @RequestParam(defaultValue = "100") int limit) {
        LoginUser admin = systemAdminGuard.requireAdmin();
        return ResUtil.success(agentRunAdminService.listEvents(runId, afterSeq, limit, admin.getUserId()));
    }
}
