package com.anynote.ai.run;

import com.anynote.ai.mapper.AgentRunEventMapper;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * Trace 清理保留期单元测试。
 *
 * @author 称霸幼儿园
 */
class AgentRunTraceCleanupTaskTest {

    /**
     * 删除时间边界固定为运行当前时刻之前 30 天。
     */
    @Test
    void deletesEventsOlderThanThirtyDays() {
        AgentRunEventMapper mapper = mock(AgentRunEventMapper.class);
        AiRunLimiter runLimiter = mock(AiRunLimiter.class);
        Clock clock = Clock.fixed(Instant.parse("2026-11-15T00:00:00Z"), ZoneOffset.UTC);
        AgentRunTraceCleanupTask task = new AgentRunTraceCleanupTask(mapper, runLimiter, clock);

        task.deleteExpiredEvents();

        verify(mapper).deleteBefore(Date.from(Instant.parse("2026-10-16T00:00:00Z")));
        org.mockito.Mockito.verify(runLimiter).acquireDb();
        org.mockito.Mockito.verify(runLimiter).releaseDb();
    }
}
