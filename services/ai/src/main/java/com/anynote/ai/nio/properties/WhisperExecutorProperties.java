package com.anynote.ai.nio.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * whisper线程池配置
 * @author 称霸幼儿园
 */
@Component
@Data
@ConfigurationProperties(prefix = "executor.whisper-executor")
public class WhisperExecutorProperties {

    private Integer corePoolSize;

    private Integer maxPoolSize;

    private Integer queueCapacity;
}
