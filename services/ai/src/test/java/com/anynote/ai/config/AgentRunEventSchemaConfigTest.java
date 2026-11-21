package com.anynote.ai.config;

import io.swagger.v3.oas.models.OpenAPI;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Agent 运行事件命名 schema 注册单元测试。
 *
 * @author 称霸幼儿园
 */
class AgentRunEventSchemaConfigTest {

    /**
     * 全部对外事件的数据类及其嵌套类型都注册为命名 schema。
     */
    @Test
    @DisplayName("注册全部事件数据类的命名 schema")
    void registersEventDataSchemas() {
        OpenAPI openApi = new OpenAPI();

        new AgentRunEventSchemaConfig().agentRunEventSchemaCustomizer().customise(openApi);

        assertThat(openApi.getComponents().getSchemas()).containsKeys(
                "AgentRunStartedEventVO", "AgentStateEventVO", "AgentToolStartedEventVO", "AgentToolFinishedEventVO",
                "AgentReasoningDeltaEventVO", "AgentReasoningFinishedEventVO", "AgentStepNoteEventVO",
                "AgentModelRetryEventVO", "AgentTextDeltaEventVO", "AgentCitationVO", "AgentUsageVO",
                "AgentErrorEventVO", "AgentRunFinishedEventVO", "AgentHeartbeatEventVO",
                "AgentToolTargetVO", "AgentToolResultVO", "AgentToolResultItemVO", "AgentLocatorVO",
                "AgentIndexWatermarkVO", "AgentIndexWatermarkFields");
    }
}
