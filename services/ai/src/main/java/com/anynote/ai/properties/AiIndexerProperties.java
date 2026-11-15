package com.anynote.ai.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 知识索引 Worker 调用配置。
 *
 * @author 称霸幼儿园
 */
@Component
@Data
@ConfigurationProperties(prefix = "anynote.ai.indexer")
public class AiIndexerProperties {

    /**
     * Worker 在 Nacos 注册的服务名。
     */
    private String serviceName = "anynote-ai-indexer";
}
