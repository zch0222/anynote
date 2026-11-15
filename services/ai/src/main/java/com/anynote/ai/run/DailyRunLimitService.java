package com.anynote.ai.run;

import com.anynote.common.redis.service.ConfigService;
import com.anynote.core.utils.DateUtils;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 按现有 RAG 配置限制用户每日 Agent 运行次数。
 *
 * @author 称霸幼儿园
 */
@Component
public class DailyRunLimitService {

    private static final RedisScript<Long> INCREMENT_IF_ALLOWED = new DefaultRedisScript<>("""
            local current = tonumber(redis.call('GET', KEYS[1]) or '0')
            local maximum = tonumber(ARGV[1])
            if current >= maximum then
                return 0
            end
            redis.call('INCR', KEYS[1])
            return 1
            """, Long.class);

    private static final RedisScript<Long> DECREMENT_RESERVATION = new DefaultRedisScript<>("""
            local current = tonumber(redis.call('GET', KEYS[1]) or '0')
            if current > 0 then
                return redis.call('DECR', KEYS[1])
            end
            return 0
            """, Long.class);

    private final ConfigService configService;

    private final StringRedisTemplate redisTemplate;

    public DailyRunLimitService(ConfigService configService, StringRedisTemplate redisTemplate) {
        this.configService = configService;
        this.redisTemplate = redisTemplate;
    }

    /**
     * 原子占用当前用户当天的一次运行次数。
     *
     * @param userId 用户标识
     * @return 成功时返回预留键，超限时返回 null
     */
    public String reserve(Long userId) {
        String key = "RAG:COUNT:" + DateUtils.getCurrentDateString() + ":" + userId;
        Long allowed = redisTemplate.execute(INCREMENT_IF_ALLOWED, List.of(key),
                String.valueOf(configService.getRagMaxDayCount()));
        return Long.valueOf(1L).equals(allowed) ? key : null;
    }

    /**
     * 释放尚未启动运行的每日次数预留。
     *
     * @param key 预留时生成的 Redis 键
     */
    public void release(String key) {
        if (key != null) {
            redisTemplate.execute(DECREMENT_RESERVATION, List.of(key));
        }
    }
}
