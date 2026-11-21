package com.anynote.ai.run;

import com.anynote.ai.model.vo.AgentProcessItemVO;
import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 落库过程视图累积单元测试：跨栈共享样例、截断与运行中工具行兜底。
 *
 * @author 称霸幼儿园
 */
class AgentRunProcessViewTest {

    private final Gson gson = new Gson();

    /**
     * 固定事件序列累积后的序列化结果与共享样例 agent-process-view.json 结构相等。
     */
    @Test
    @DisplayName("固定事件序列的落库结果等于共享样例")
    void accumulatedViewMatchesSharedFixture() throws IOException {
        AgentRunProcessView view = fixtureView(gson);

        JsonElement actual = JsonParser.parseString(gson.toJson(view));

        assertThat(actual).isEqualTo(JsonParser.parseString(readFixture("agent-process-view.json")));
    }

    /**
     * 思考全文超过上限时截断并追加标注，未超过的不变。
     */
    @Test
    @DisplayName("思考全文按上限截断并标注")
    void completeTruncatesReasoningAboveLimit() {
        AgentRunProcessView view = new AgentRunProcessView();
        view.accumulate(event(gson, "reasoning.delta", "{\"id\":\"b1\",\"delta\":\"" + "想".repeat(600) + "\"}"));
        view.accumulate(event(gson, "reasoning.delta", "{\"id\":\"b2\",\"delta\":\"短\"}"));

        view.complete(500);

        assertThat(view.getItems().get(0).getText()).isEqualTo("想".repeat(500) + AgentRunProcessView.TRUNCATION_MARK);
        assertThat(view.getItems().get(1).getText()).isEqualTo("短");
    }

    /**
     * 运行收尾时仍在进行中的工具行标为失败，已结束的不变。
     */
    @Test
    @DisplayName("收尾时进行中的工具行标为失败")
    void completeMarksRunningToolsFailed() {
        AgentRunProcessView view = new AgentRunProcessView();
        view.accumulate(event(gson, "tool.started", "{\"id\":\"c1\",\"name\":\"kb_read\"}"));
        view.accumulate(event(gson, "tool.started", "{\"id\":\"c2\",\"name\":\"kb_search\"}"));
        view.accumulate(event(gson, "tool.finished",
                "{\"id\":\"c2\",\"name\":\"kb_search\",\"status\":\"SUCCESS\",\"durationMs\":10}"));

        view.complete(8000);

        List<AgentProcessItemVO> items = view.getItems();
        assertThat(items).extracting(AgentProcessItemVO::getStatus).containsExactly("FAILED", "SUCCESS");
    }

    /**
     * 非过程事件不产生过程行。
     */
    @Test
    @DisplayName("非过程事件不产生过程行")
    void ignoresNonProcessEvents() {
        AgentRunProcessView view = new AgentRunProcessView();
        view.accumulate(event(gson, "text.delta", "{\"delta\":\"答案\"}"));
        view.accumulate(null);

        assertThat(view.hasItems()).isFalse();
    }

    /**
     * 用共享样例对应的固定事件序列构造落库视图。
     *
     * @param gson JSON 解析器
     * @return 收尾后的落库视图
     */
    static AgentRunProcessView fixtureView(Gson gson) {
        AgentRunProcessView view = new AgentRunProcessView();
        view.accumulate(event(gson, "reasoning.delta", "{\"id\":\"b1\",\"delta\":\"先看用户有哪些\"}"));
        view.accumulate(event(gson, "reasoning.delta", "{\"id\":\"b1\",\"delta\":\"和课程相关的知识库\"}"));
        view.accumulate(event(gson, "reasoning.finished", "{\"id\":\"b1\",\"durationMs\":2100,\"status\":\"done\"}"));
        view.accumulate(event(gson, "tool.started", "{\"id\":\"c1\",\"name\":\"kb_search\",\"summary\":\"检索知识库\","
                + "\"target\":{\"label\":\"期末复习 · 课程库\",\"resolved\":true}}"));
        view.accumulate(event(gson, "tool.finished", "{\"id\":\"c1\",\"name\":\"kb_search\",\"status\":\"SUCCESS\","
                + "\"hitCount\":2,\"durationMs\":820,\"errorCategory\":null,\"retryable\":false,"
                + "\"target\":{\"label\":\"期末复习 · 课程库\",\"resolved\":true},"
                + "\"result\":{\"count\":5,\"items\":["
                + "{\"ref\":\"note:12\",\"title\":\"数据结构复习提纲\",\"kbName\":\"课程库\",\"kbId\":3,"
                + "\"locator\":{\"sectionPath\":\"第2章/2.1\",\"startLine\":10}},"
                + "{\"ref\":\"doc:7\",\"title\":\"往年试卷\",\"kbName\":\"课程库\",\"kbId\":3,"
                + "\"locator\":{\"pageStart\":2}}]}}"));
        view.accumulate(event(gson, "step.note", "{\"id\":\"n1\",\"text\":\"先看看提纲\"}"));
        view.accumulate(event(gson, "model.retry", "{\"id\":\"r1\",\"attempt\":2}"));
        view.accumulate(event(gson, "reasoning.delta", "{\"id\":\"b2\",\"delta\":\"再读一下原文\"}"));
        view.accumulate(event(gson, "reasoning.finished",
                "{\"id\":\"b2\",\"durationMs\":300,\"status\":\"interrupted\"}"));
        view.complete(8000);
        view.setDurationMs(18230L);
        view.setToolCalls(1);
        view.setFirstOutputMs(350L);
        view.getDependencies().addAll(List.of("note:12", "doc:7"));
        return view;
    }

    /**
     * 读取共享样例文件。
     *
     * @param name 样例文件名
     * @return 样例内容
     */
    static String readFixture(String name) throws IOException {
        try (InputStream input = AgentRunProcessViewTest.class.getResourceAsStream("/fixtures/" + name)) {
            if (input == null) {
                throw new IOException("样例不存在：" + name);
            }
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Object event(Gson gson, String type, String json) {
        return AgentRunEventTypes.parse(type, JsonParser.parseString(json).getAsJsonObject(), gson);
    }
}
