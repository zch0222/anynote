package com.anynote.ai.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Harness（Python 服务）调用参数配置。
 *
 * @author 称霸幼儿园
 */
@Component
@Data
@ConfigurationProperties(prefix = "anynote.ai.harness")
public class AiHarnessProperties {

    /**
     * Python 服务在 Nacos 上的服务名
     */
    private String serviceName = "anynote-ai-harness";

    /**
     * 建立连接的超时时间
     */
    private Duration connectTimeout = Duration.ofSeconds(3);

    /**
     * 上游两次事件之间的最长空闲时间
     */
    private Duration idleTimeout = Duration.ofSeconds(30);

    /**
     * 单次流式调用的总超时时间
     */
    private Duration totalTimeout = Duration.ofSeconds(120);
}
