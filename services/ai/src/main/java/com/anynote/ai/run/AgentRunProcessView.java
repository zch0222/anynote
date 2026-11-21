package com.anynote.ai.run;

import com.anynote.ai.model.vo.AgentModelRetryEventVO;
import com.anynote.ai.model.vo.AgentProcessItemVO;
import com.anynote.ai.model.vo.AgentReasoningDeltaEventVO;
import com.anynote.ai.model.vo.AgentReasoningFinishedEventVO;
import com.anynote.ai.model.vo.AgentStepNoteEventVO;
import com.anynote.ai.model.vo.AgentToolFinishedEventVO;
import com.anynote.ai.model.vo.AgentToolStartedEventVO;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 落库的 Agent 运行过程视图（a_chat_message.process），读取时按当前权限复核后才发给浏览器。
 *
 * <p>dependencies 是本次运行模型看到过的全部实体键，只用于复核，不发给浏览器。</p>
 *
 * @author 称霸幼儿园
 */
@Data
public class AgentRunProcessView {

    /**
     * 思考全文超过上限时追加的截断标注。
     */
    public static final String TRUNCATION_MARK = "…（截断）";

    private static final String TYPE_REASONING = "reasoning";

    private static final String TYPE_TOOL = "tool";

    private static final String STATUS_RUNNING = "running";

    private static final String STATUS_FAILED = "FAILED";

    private int version = 1;

    private Long durationMs;

    private Integer toolCalls;

    private Long firstOutputMs;

    private List<AgentProcessItemVO> items = new ArrayList<>();

    private List<String> dependencies = new ArrayList<>();

    /**
     * 判断过程视图是否有任何可展示行。
     *
     * @return 有内容返回 true
     */
    public boolean hasItems() {
        return !items.isEmpty();
    }

    /**
     * 累积一条用户视图事件为过程行：思考增量合并进同块，工具行按调用标识补全结果。
     *
     * @param data 事件数据，非过程事件忽略
     */
    public void accumulate(Object data) {
        switch (data) {
            case AgentReasoningDeltaEventVO event -> accumulateReasoning(event);
            case AgentReasoningFinishedEventVO event -> closeReasoning(event);
            case AgentStepNoteEventVO event -> items.add(AgentProcessItemVO.builder()
                    .type("note").id(event.getId()).text(event.getText() == null ? "" : event.getText()).build());
            case AgentModelRetryEventVO event -> items.add(AgentProcessItemVO.builder()
                    .type("retry").id(event.getId()).build());
            case AgentToolStartedEventVO event -> {
                AgentProcessItemVO item = toolItem(event.getId(), event.getName());
                item.setStatus(STATUS_RUNNING);
                item.setTarget(event.getTarget());
            }
            case AgentToolFinishedEventVO event -> {
                AgentProcessItemVO item = toolItem(event.getId(), event.getName());
                item.setStatus(event.getStatus());
                item.setDurationMs(event.getDurationMs());
                item.setTarget(event.getTarget());
                item.setResult(event.getResult());
            }
            case null, default -> {
            }
        }
    }

    /**
     * 运行收尾：思考全文超过上限的截断并标注，仍在进行中的工具行标为失败。
     *
     * @param reasoningMaxChars 思考全文截断上限
     */
    public void complete(int reasoningMaxChars) {
        for (AgentProcessItemVO item : items) {
            if (TYPE_REASONING.equals(item.getType()) && item.getText() != null
                    && item.getText().length() > reasoningMaxChars) {
                item.setText(item.getText().substring(0, reasoningMaxChars) + TRUNCATION_MARK);
            }
            if (TYPE_TOOL.equals(item.getType()) && STATUS_RUNNING.equals(item.getStatus())) {
                item.setStatus(STATUS_FAILED);
            }
        }
    }

    private void accumulateReasoning(AgentReasoningDeltaEventVO event) {
        String delta = event.getDelta() == null ? "" : event.getDelta();
        AgentProcessItemVO item = find(TYPE_REASONING, event.getId());
        if (item == null) {
            items.add(AgentProcessItemVO.builder()
                    .type(TYPE_REASONING).id(event.getId()).text(delta).status("streaming").build());
            return;
        }
        item.setText(item.getText() == null ? delta : item.getText() + delta);
    }

    private void closeReasoning(AgentReasoningFinishedEventVO event) {
        AgentProcessItemVO item = find(TYPE_REASONING, event.getId());
        if (item != null) {
            item.setStatus(event.getStatus());
            item.setDurationMs(event.getDurationMs());
        }
    }

    private AgentProcessItemVO toolItem(String id, String name) {
        AgentProcessItemVO item = find(TYPE_TOOL, id);
        if (item == null) {
            item = AgentProcessItemVO.builder().type(TYPE_TOOL).id(id).name(name).build();
            items.add(item);
        }
        return item;
    }

    private AgentProcessItemVO find(String type, String id) {
        for (int index = items.size() - 1; index >= 0; index--) {
            AgentProcessItemVO item = items.get(index);
            if (type.equals(item.getType()) && id != null && id.equals(item.getId())) {
                return item;
            }
        }
        return null;
    }
}
