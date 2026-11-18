package com.anynote.ai.run;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Java 转发给浏览器的事件类型与字段白名单（I4：未登记的类型不转发，未登记的字段删除）。
 *
 * @author 称霸幼儿园
 */
public final class AgentRunEventWhitelist {

    /**
     * 未登记字段删除规则：value 为 true 表示允许下发。
     */
    private static final Map<String, Set<String>> FIELDS = buildFields();

    private AgentRunEventWhitelist() {
    }

    /**
     * 判断事件类型是否登记。
     *
     * @param type 事件类型
     * @return 是否允许转发
     */
    public static boolean allowsType(String type) {
        return FIELDS.containsKey(type);
    }

    /**
     * 按登记字段裁剪事件数据。
     *
     * @param type 事件类型
     * @param data 原始数据
     * @return 只含登记字段的数据
     */
    public static Map<String, Object> sanitize(String type, Map<String, Object> data) {
        Set<String> allowed = FIELDS.get(type);
        if (allowed == null) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            if (allowed.contains(entry.getKey())) {
                result.put(entry.getKey(), entry.getValue());
            }
        }
        return result;
    }

    private static Map<String, Set<String>> buildFields() {
        Map<String, Set<String>> fields = new LinkedHashMap<>();
        fields.put("run.started", Set.of(
                "agent", "agentVersion", "model", "scope", "scopeSummary",
                "conversationId", "indexWatermark"));
        fields.put("state", Set.of("previousState", "state"));
        fields.put("tool.started", Set.of("callId", "name", "summary", "target"));
        fields.put("tool.finished", Set.of(
                "callId", "name", "status", "durationMs", "errorCategory", "retryable",
                "target", "result"));
        fields.put("reasoning.delta", Set.of("blockId", "delta"));
        fields.put("reasoning.finished", Set.of("blockId", "durationMs", "status"));
        fields.put("step.note", Set.of("noteId", "text"));
        fields.put("model.retry", Set.of("attempt"));
        fields.put("text.delta", Set.of("delta"));
        fields.put("citation", Set.of(
                "index", "evidenceId", "sourceType", "sourceId", "title", "locator",
                "snippet", "stale", "authority", "kbId", "kbName", "permissionBasis"));
        fields.put("usage", Set.of(
                "promptTokens", "completionTokens", "totalTokens", "reasoningTokens", "known"));
        fields.put("error", Set.of("category", "retryable", "message"));
        fields.put("run.finished", Set.of(
                "state", "outcome", "evidence", "answerNotices", "unfinished", "usage"));
        fields.put("heartbeat", Set.of());
        return fields;
    }
}
