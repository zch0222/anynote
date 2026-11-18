package com.anynote.ai.run;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 事件转发白名单单测。
 *
 * @author 称霸幼儿园
 */
class AgentRunEventWhitelistTest {

    /**
     * 验证未登记的事件类型被拒绝、登记类型通过。
     */
    @Test
    @DisplayName("未登记类型不转发，登记类型放行")
    void unregisteredTypesAreRejected() {
        assertThat(AgentRunEventWhitelist.allowsType("trace.model")).isFalse();
        assertThat(AgentRunEventWhitelist.allowsType("unknown.event")).isFalse();
        assertThat(AgentRunEventWhitelist.allowsType("reasoning.delta")).isTrue();
        assertThat(AgentRunEventWhitelist.allowsType("tool.finished")).isTrue();
        assertThat(AgentRunEventWhitelist.allowsType("heartbeat")).isTrue();
    }

    /**
     * 验证白名单裁掉未登记字段、保留登记字段。
     */
    @Test
    @DisplayName("未登记字段被删除")
    void unregisteredFieldsAreStripped() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("callId", "c1");
        data.put("name", "kb_search");
        data.put("summary", "检索知识库");
        data.put("target", Map.of("label", "期末复习", "resolved", true));
        data.put("diagnostics", "不应下发");

        Map<String, Object> sanitized = AgentRunEventWhitelist.sanitize("tool.started", data);

        assertThat(sanitized).containsKeys("callId", "name", "summary", "target");
        assertThat(sanitized).doesNotContainKey("diagnostics");
    }

    /**
     * 验证 heartbeat 只允许空数据。
     */
    @Test
    @DisplayName("heartbeat 只允许空数据")
    void heartbeatAllowsEmptyOnly() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("anything", "value");
        assertThat(AgentRunEventWhitelist.sanitize("heartbeat", data)).isEmpty();
    }
}
