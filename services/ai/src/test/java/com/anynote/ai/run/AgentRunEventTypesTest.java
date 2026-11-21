package com.anynote.ai.run;

import com.anynote.ai.model.vo.AgentCitationVO;
import com.anynote.ai.model.vo.AgentHeartbeatEventVO;
import com.anynote.ai.model.vo.AgentToolFinishedEventVO;
import com.anynote.ai.model.vo.AgentToolStartedEventVO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 对外事件类型与数据类单元测试。
 *
 * @author 称霸幼儿园
 */
class AgentRunEventTypesTest {

    private final Gson gson = new Gson();

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 未登记的类型与 Trace 事件不解析，登记类型解析为对应数据类。
     */
    @Test
    @DisplayName("只解析登记过的事件类型")
    void parsesOnlyRegisteredTypes() {
        assertThat(AgentRunEventTypes.parse("unknown.event", json("{}"), gson)).isNull();
        assertThat(AgentRunEventTypes.parse("trace.model", json("{}"), gson)).isNull();
        assertThat(AgentRunEventTypes.parse(null, json("{}"), gson)).isNull();
        assertThat(AgentRunEventTypes.parse("tool.started", json("{}"), gson)).isInstanceOf(AgentToolStartedEventVO.class);
        assertThat(AgentRunEventTypes.parse("heartbeat", null, gson)).isInstanceOf(AgentHeartbeatEventVO.class);
        assertThat(AgentRunEventTypes.isTrace("trace.dependencies")).isTrue();
        assertThat(AgentRunEventTypes.isTrace("tool.started")).isFalse();
        assertThat(AgentRunEventTypes.dataClasses()).hasSize(14);
    }

    /**
     * 顶层与嵌套对象（对象、结果、结果条目、定位）里的未登记字段都不进入解析结果。
     */
    @Test
    @DisplayName("嵌套对象里的未登记字段被丢弃")
    void dropsUnregisteredNestedFields() throws Exception {
        Object data = AgentRunEventTypes.parse("tool.finished", json("{\"id\":\"c1\",\"name\":\"kb_search\","
                + "\"status\":\"SUCCESS\",\"diagnostics\":{\"top\":[1]},"
                + "\"target\":{\"label\":\"期末复习\",\"resolved\":true,\"raw\":\"x\"},"
                + "\"result\":{\"count\":1,\"candidates\":20,\"items\":[{\"ref\":\"note:12\",\"title\":\"提纲\","
                + "\"score\":0.9,\"locator\":{\"heading\":\"2.1\",\"_key\":\"k\"}}]}}"), gson);

        JsonNode tree = objectMapper.readTree(objectMapper.writeValueAsString(data));
        assertThat(data).isInstanceOf(AgentToolFinishedEventVO.class);
        assertThat(names(tree)).containsExactlyInAnyOrder("id", "name", "status", "target", "result");
        assertThat(names(tree.get("target"))).containsExactlyInAnyOrder("label", "resolved");
        assertThat(names(tree.get("result"))).containsExactlyInAnyOrder("count", "items");
        assertThat(names(tree.get("result").get("items").get(0))).containsExactlyInAnyOrder("ref", "title", "locator");
        assertThat(names(tree.get("result").get("items").get(0).get("locator"))).containsExactly("heading");
    }

    /**
     * 引用事件的定位只保留登记的定位字段。
     */
    @Test
    @DisplayName("引用定位只保留登记字段")
    void citationLocatorKeepsRegisteredFields() {
        AgentCitationVO citation = (AgentCitationVO) AgentRunEventTypes.parse("citation", json("{\"index\":1,"
                + "\"sourceId\":\"mooc_item:5#transcript\",\"locator\":{\"startTimeMs\":12000,\"moocId\":8,"
                + "\"private\":true}}"), gson);

        assertThat(citation.getLocator().getStartTimeMs()).isEqualTo(12000L);
        assertThat(citation.getLocator().getMoocId()).isEqualTo(8L);
    }

    private com.google.gson.JsonObject json(String value) {
        return JsonParser.parseString(value).getAsJsonObject();
    }

    private List<String> names(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }
}
