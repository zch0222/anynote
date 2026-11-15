package com.anynote.ai.run;

import com.anynote.ai.properties.AiRunProperties;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * AI 运行的并发限制：每用户运行数、全局运行数与数据库访问数各一个信号量。
 *
 * @author 称霸幼儿园
 */
@Component
public class AiRunLimiter {

    private final AiRunProperties aiRunProperties;

    private final Semaphore totalPermits;

    private final Semaphore dbPermits;

    private final ConcurrentHashMap<Long, Integer> userRuns = new ConcurrentHashMap<>();

    public AiRunLimiter(AiRunProperties aiRunProperties) {
        this.aiRunProperties = aiRunProperties;
        this.totalPermits = new Semaphore(aiRunProperties.getMaxConcurrentTotal());
        this.dbPermits = new Semaphore(aiRunProperties.getDbBulkhead());
    }

    /**
     * 尝试占用一次运行名额，不阻塞。
     *
     * @param userId 用户 id
     * @return 占用成功返回 true
     */
    public boolean tryAcquire(Long userId) {
        Long key = userId == null ? -1L : userId;
        AtomicBoolean acquired = new AtomicBoolean();
        userRuns.compute(key, (ignored, current) -> {
            int count = current == null ? 0 : current;
            if (count >= aiRunProperties.getMaxConcurrentPerUser()) {
                return current;
            }
            acquired.set(true);
            return count + 1;
        });
        if (!acquired.get()) {
            return false;
        }
        if (!totalPermits.tryAcquire()) {
            decrementUserCount(key);
            return false;
        }
        return true;
    }

    /**
     * 释放一次运行名额。
     *
     * @param userId 用户 id
     */
    public void release(Long userId) {
        Long key = userId == null ? -1L : userId;
        if (decrementUserCount(key)) {
            totalPermits.release();
        }
    }

    private boolean decrementUserCount(Long key) {
        AtomicBoolean released = new AtomicBoolean();
        userRuns.computeIfPresent(key, (ignored, current) -> {
            released.set(true);
            return current <= 1 ? null : current - 1;
        });
        return released.get();
    }

    /**
     * 占用一个数据库访问名额，阻塞直到可用。
     */
    public void acquireDb() {
        try {
            dbPermits.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("等待数据库访问名额时被中断", e);
        }
    }

    /**
     * 释放一个数据库访问名额。
     */
    public void releaseDb() {
        dbPermits.release();
    }
}
