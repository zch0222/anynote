package com.anynote.ai.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 流式运行与数据库并发限制配置。
 *
 * @author 称霸幼儿园
 */
@Component
@Data
@ConfigurationProperties(prefix = "anynote.ai.run")
public class AiRunProperties {

    /**
     * 每用户最大并发运行数
     */
    private int maxConcurrentPerUser = 2;

    /**
     * 全局最大并发运行数
     */
    private int maxConcurrentTotal = 500;

    /**
     * 访问数据库的并发上限
     */
    private int dbBulkhead = 20;
}
