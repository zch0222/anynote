package com.anynote.ai.run;

import com.anynote.ai.properties.AiRunProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

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

    /**
     * 并发释放与重新占用时，同一用户的活跃运行数仍受上限约束。
     */
    @Test
    @DisplayName("同用户并发释放与占用不突破用户上限")
    void doesNotRemoveCounterWhileAnotherRunIsActive() throws Exception {
        AiRunProperties properties = new AiRunProperties();
        properties.setMaxConcurrentPerUser(1);
        properties.setMaxConcurrentTotal(20);
        properties.setDbBulkhead(1);
        AiRunLimiter limiter = new AiRunLimiter(properties);
        int workers = 8;
        int iterations = 5_000;
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger active = new AtomicInteger();
        AtomicInteger maximum = new AtomicInteger();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        List<Future<?>> futures = new ArrayList<>();
        try {
            for (int worker = 0; worker < workers; worker++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    for (int iteration = 0; iteration < iterations; iteration++) {
                        if (!limiter.tryAcquire(1L)) {
                            Thread.yield();
                            continue;
                        }
                        int current = active.incrementAndGet();
                        maximum.accumulateAndGet(current, Math::max);
                        if (current > 1) {
                            failure.compareAndSet(null, new AssertionError("per-user limit exceeded"));
                        }
                        Thread.yield();
                        active.decrementAndGet();
                        limiter.release(1L);
                    }
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> future : futures) {
                future.get();
            }
        } finally {
            executor.shutdownNow();
        }

        assertThat(failure.get()).isNull();
        assertThat(maximum.get()).isLessThanOrEqualTo(1);
    }
}
