package com.anynote.ai.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Whisper 独立进程调用配置。
 *
 * @author 称霸幼儿园
 */
@Component
@Data
@ConfigurationProperties(prefix = "anynote.ai.whisper")
public class AiWhisperProperties {

    /**
     * Whisper 服务在 Nacos 上的服务名
     */
    private String serviceName = "anynote-ai-whisper";
}
