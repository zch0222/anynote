package com.anynote.ai.run;

import com.google.gson.JsonObject;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Agent 运行的用户过程视图（落库 a_chat_message.process，读取时按当前权限复核）。
 *
 * <p>浏览器只收到 items；dependencies 不发给前端，仅用于服务端复核。</p>
 *
 * @author 称霸幼儿园
 */
@Data
public class AgentRunProcessView {

    private int version = 1;

    private long durationMs;

    private boolean hidden;

    private List<Item> items = new ArrayList<>();

    private List<String> dependencies = new ArrayList<>();

    private int reasoningChars;

    /**
     * 判断过程视图是否有任何可展示行。
     *
     * @return 有内容返回 true
     */
    public boolean hasItems() {
        return !items.isEmpty();
    }

    /**
     * 过程视图累积器，绑定一次运行的 Gson 与思考截断上限。
     *
     * @author 称霸幼儿园
     */
    public static class Accumulator {

        private final AgentRunProcessView view = new AgentRunProcessView();

        private final com.google.gson.Gson gson;

        private final int reasoningMaxChars;

        /**
         * 构造累积器。
         *
         * @param gson JSON 序列化器
         * @param reasoningMaxChars 思考全文截断上限
         */
        public Accumulator(com.google.gson.Gson gson, int reasoningMaxChars) {
            this.gson = gson;
            this.reasoningMaxChars = reasoningMaxChars;
        }

        /**
         * 累积一条用户视图事件为过程行。
         *
         * @param type 事件类型
         * @param data 白名单后的事件数据
         */
        public void accumulate(String type, Map<String, Object> data) {
            view.accumulate(type, data, gson, reasoningMaxChars);
        }

        /**
         * 返回累积中的过程视图。
         *
         * @return 过程视图
         */
        public AgentRunProcessView view() {
            return view;
        }
    }

    /**
     * 累积一条用户视图事件为过程行（思考增量合并进同块、工具行补结果）。
     *
     * @param type 事件类型
     * @param data 白名单后的事件数据
     * @param gson JSON 序列化器（locator 转换用）
     * @param reasoningMaxChars 思考全文截断上限
     */
    void accumulate(String type, Map<String, Object> data, com.google.gson.Gson gson, int reasoningMaxChars) {
        switch (type) {
            case "reasoning.delta" -> accumulateReasoning(data, reasoningMaxChars);
            case "reasoning.finished" -> closeReasoning(data);
            case "step.note" -> items.add(noteItem(data));
            case "model.retry" -> items.add(retryItem());
            case "tool.started" -> accumulateToolStarted(data);
            case "tool.finished" -> accumulateToolFinished(data, gson);
            default -> {
            }
        }
    }

    private void accumulateReasoning(Map<String, Object> data, int reasoningMaxChars) {
        String blockId = String.valueOf(data.get("blockId"));
        String delta = data.get("delta") instanceof String value ? value : "";
        Item item = findReasoning(blockId);
        if (item == null) {
            item = new Item();
            item.setType("reasoning");
            item.setBlockId(blockId);
            item.setStatus("streaming");
            item.setText(delta);
            items.add(item);
        } else {
            item.setText(item.getText() == null ? delta : item.getText() + delta);
        }
        reasoningChars += delta.length();
        if (item.getText() != null && item.getText().length() > reasoningMaxChars) {
            item.setText(item.getText().substring(0, reasoningMaxChars) + "…（截断）");
        }
    }

    private void closeReasoning(Map<String, Object> data) {
        Item item = findReasoning(String.valueOf(data.get("blockId")));
        if (item != null) {
            item.setStatus(String.valueOf(data.get("status")));
            Object duration = data.get("durationMs");
            item.setDurationMs(duration instanceof Number number ? number.longValue() : null);
        }
    }

    private Item findReasoning(String blockId) {
        for (int index = items.size() - 1; index >= 0; index--) {
            Item item = items.get(index);
            if ("reasoning".equals(item.getType()) && blockId.equals(item.getBlockId())) {
                return item;
            }
        }
        return null;
    }

    private Item noteItem(Map<String, Object> data) {
        Item item = new Item();
        item.setType("note");
        item.setText(data.get("text") instanceof String value ? value : "");
        return item;
    }

    private Item retryItem() {
        Item item = new Item();
        item.setType("retry");
        return item;
    }

    private void accumulateToolStarted(Map<String, Object> data) {
        Item item = toolItem(data);
        item.setStatus("running");
        Object target = data.get("target");
        if (target instanceof Map<?, ?> map) {
            item.setTarget(Item.Target.of(
                    map.get("label") == null ? null : String.valueOf(map.get("label")),
                    Boolean.TRUE.equals(map.get("resolved"))));
        }
    }

    private void accumulateToolFinished(Map<String, Object> data, com.google.gson.Gson gson) {
        Item item = toolItem(data);
        item.setStatus(String.valueOf(data.get("status")));
        Object duration = data.get("durationMs");
        item.setDurationMs(duration instanceof Number number ? number.longValue() : null);
        Object target = data.get("target");
        if (target instanceof Map<?, ?> map) {
            item.setTarget(Item.Target.of(
                    map.get("label") == null ? null : String.valueOf(map.get("label")),
                    Boolean.TRUE.equals(map.get("resolved"))));
        }
        Object result = data.get("result");
        if (result instanceof Map<?, ?> map) {
            Item.Result summary = new Item.Result();
            Object count = map.get("count");
            summary.setCount(count instanceof Number number ? number.intValue() : 0);
            Object entries = map.get("items");
            if (entries instanceof List<?> list) {
                for (Object entry : list) {
                    if (entry instanceof Map<?, ?> entryMap) {
                        Item.ResultItem resultItem = new Item.ResultItem();
                        resultItem.setRef(entryMap.get("ref") == null
                                ? null : String.valueOf(entryMap.get("ref")));
                        resultItem.setTitle(entryMap.get("title") == null
                                ? null : String.valueOf(entryMap.get("title")));
                        resultItem.setKbName(entryMap.get("kbName") == null
                                ? null : String.valueOf(entryMap.get("kbName")));
                        if (entryMap.get("locator") != null) {
                            resultItem.setLocator(
                                    gson.toJsonTree(entryMap.get("locator")).getAsJsonObject());
                        }
                        summary.getItems().add(resultItem);
                    }
                }
            }
            item.setResult(summary);
        }
    }

    private Item toolItem(Map<String, Object> data) {
        String callId = String.valueOf(data.get("callId"));
        for (int index = items.size() - 1; index >= 0; index--) {
            Item item = items.get(index);
            if ("tool".equals(item.getType()) && callId.equals(item.getBlockId())) {
                return item;
            }
        }
        Item item = new Item();
        item.setType("tool");
        item.setBlockId(callId);
        item.setName(data.get("name") == null ? null : String.valueOf(data.get("name")));
        items.add(item);
        return item;
    }

    /**
     * 过程视图中的一行：思考、工具调用、过程说明或重试。
     *
     * @author 称霸幼儿园
     */
    @Data
    public static class Item {

        private String type;
        private String blockId;
        private String text;
        private Long durationMs;
        private String status;
        private String name;
        private Target target;
        private Result result;

        /**
         * 工具行对象：label 只取自可见集，resolved 表示是否已解析出名称。
         *
         * @author 称霸幼儿园
         */
        @Data
        public static class Target {

            private String label;
            private boolean resolved;

            public static Target of(String label, boolean resolved) {
                Target target = new Target();
                target.label = label;
                target.resolved = resolved;
                return target;
            }
        }

        /**
         * 工具结果摘要：命中数与前 3 个条目。
         *
         * @author 称霸幼儿园
         */
        @Data
        public static class Result {

            private int count;
            private List<ResultItem> items = new ArrayList<>();
        }

        /**
         * 结果条目：引用、标题、知识库名与定位。
         *
         * @author 称霸幼儿园
         */
        @Data
        public static class ResultItem {

            private String ref;
            private String title;
            private String kbName;
            private JsonObject locator;
        }
    }
}
