package com.anynote.ai.run;

import com.anynote.ai.mapper.AgentRunEventMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.Date;

/**
 * 每日清理保留期之外的运行 Trace 事件。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Component
public class AgentRunTraceCleanupTask {

    private static final Duration RETENTION = Duration.ofDays(30);

    private final AgentRunEventMapper mapper;

    private final AiRunLimiter runLimiter;

    private final Clock clock;

    /**
     * 构造 Trace 清理任务。
     *
     * @param mapper 运行事件映射器
     * @param runLimiter 数据库并发限制器
     */
    @Autowired
    public AgentRunTraceCleanupTask(AgentRunEventMapper mapper, AiRunLimiter runLimiter) {
        this(mapper, runLimiter, Clock.systemDefaultZone());
    }

    /**
     * 构造可注入时钟的 Trace 清理任务。
     *
     * @param mapper 运行事件映射器
     * @param runLimiter 数据库并发限制器
     * @param clock 当前时钟
     */
    AgentRunTraceCleanupTask(AgentRunEventMapper mapper, AiRunLimiter runLimiter, Clock clock) {
        this.mapper = mapper;
        this.runLimiter = runLimiter;
        this.clock = clock;
    }

    /**
     * 删除 30 天前的运行事件。
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "Asia/Shanghai")
    public void deleteExpiredEvents() {
        Date cutoff = Date.from(clock.instant().minus(RETENTION));
        runLimiter.acquireDb();
        int deleted;
        try {
            deleted = mapper.deleteBefore(cutoff);
        } finally {
            runLimiter.releaseDb();
        }
        log.info("清理过期 Agent Trace 事件 count={}", deleted);
    }
}
