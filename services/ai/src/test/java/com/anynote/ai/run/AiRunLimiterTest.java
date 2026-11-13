package com.anynote.ai.run;

import com.anynote.ai.properties.AiRunProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link AiRunLimiter} 单元测试：每用户、全局与数据库并发名额。
 *
 * @author 称霸幼儿园
 */
class AiRunLimiterTest {

    @Test
    @DisplayName("每用户并发达到上限后拒绝，释放后恢复")
    void limitsPerUser() {
        AiRunProperties properties = new AiRunProperties();
        properties.setMaxConcurrentPerUser(1);
        properties.setMaxConcurrentTotal(10);
        properties.setDbBulkhead(1);
        AiRunLimiter limiter = new AiRunLimiter(properties);

        assertThat(limiter.tryAcquire(1L)).isTrue();
        assertThat(limiter.tryAcquire(1L)).isFalse();
        assertThat(limiter.tryAcquire(2L)).isTrue();

        limiter.release(1L);
        assertThat(limiter.tryAcquire(1L)).isTrue();
    }

    @Test
    @DisplayName("全局并发达到上限后拒绝并回滚用户计数")
    void limitsTotal() {
        AiRunProperties properties = new AiRunProperties();
        properties.setMaxConcurrentPerUser(5);
        properties.setMaxConcurrentTotal(1);
        properties.setDbBulkhead(1);
        AiRunLimiter limiter = new AiRunLimiter(properties);

        assertThat(limiter.tryAcquire(1L)).isTrue();
        assertThat(limiter.tryAcquire(2L)).isFalse();
        assertThat(limiter.tryAcquire(1L)).isFalse();

        limiter.release(1L);
        assertThat(limiter.tryAcquire(2L)).isTrue();
    }

    @Test
    @DisplayName("数据库名额可获取与释放")
    void acquiresAndReleasesDbPermit() {
        AiRunProperties properties = new AiRunProperties();
        properties.setMaxConcurrentPerUser(1);
        properties.setMaxConcurrentTotal(1);
        properties.setDbBulkhead(1);
        AiRunLimiter limiter = new AiRunLimiter(properties);

        limiter.acquireDb();
        limiter.releaseDb();
        limiter.acquireDb();
        limiter.releaseDb();
    }
}
