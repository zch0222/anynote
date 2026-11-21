package com.anynote.ai.config;

import com.anynote.ai.run.AgentRunEventTypes;
import io.swagger.v3.core.converter.AnnotatedType;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 把 Agent 运行事件的数据类注册为 OpenAPI 命名 schema（SSE 事件信封的 data 按事件类型对应这些 schema）。
 *
 * @author 称霸幼儿园
 */
@Configuration
public class AgentRunEventSchemaConfig {

    /**
     * 注册事件数据类的命名 schema。
     *
     * @return OpenAPI 定制器
     */
    @Bean
    public OpenApiCustomizer agentRunEventSchemaCustomizer() {
        return openApi -> {
            Components components = openApi.getComponents() == null ? new Components() : openApi.getComponents();
            for (Class<?> dataClass : AgentRunEventTypes.dataClasses()) {
                ModelConverters.getInstance().readAll(new AnnotatedType(dataClass)).forEach(components::addSchemas);
            }
            openApi.setComponents(components);
        };
    }
}
