package com.anynote.ai.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/**
 * Redis 订阅监听容器配置，用于 Whisper 任务状态推送。
 *
 * @author 称霸幼儿园
 */
@Configuration
public class RedisListenerConfig {

    /**
     * Redis 消息监听容器。
     *
     * @param redisConnectionFactory Redis 连接工厂
     * @return 监听容器
     */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(RedisConnectionFactory redisConnectionFactory) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisConnectionFactory);
        return container;
    }
}
