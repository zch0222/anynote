package com.anynote.ai.run;

import com.anynote.ai.model.vo.AgentCitationVO;
import com.anynote.ai.model.vo.AgentErrorEventVO;
import com.anynote.ai.model.vo.AgentHeartbeatEventVO;
import com.anynote.ai.model.vo.AgentModelRetryEventVO;
import com.anynote.ai.model.vo.AgentReasoningDeltaEventVO;
import com.anynote.ai.model.vo.AgentReasoningFinishedEventVO;
import com.anynote.ai.model.vo.AgentRunFinishedEventVO;
import com.anynote.ai.model.vo.AgentRunStartedEventVO;
import com.anynote.ai.model.vo.AgentStateEventVO;
import com.anynote.ai.model.vo.AgentStepNoteEventVO;
import com.anynote.ai.model.vo.AgentTextDeltaEventVO;
import com.anynote.ai.model.vo.AgentToolFinishedEventVO;
import com.anynote.ai.model.vo.AgentToolStartedEventVO;
import com.anynote.ai.model.vo.AgentUsageVO;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 转发给浏览器的事件类型与数据类：未登记的类型不转发，数据按登记的类解析，类上没有的字段自然丢弃。
 *
 * <p>trace.* 只落库、不转发。</p>
 *
 * @author 称霸幼儿园
 */
public final class AgentRunEventTypes {

    private static final String TRACE_PREFIX = "trace.";

    private static final Map<String, Class<?>> FORWARDED = buildForwarded();

    private AgentRunEventTypes() {
    }

    /**
     * 判断是否为只落库的 Trace 事件。
     *
     * @param type 事件类型
     * @return 是否为 Trace 事件
     */
    public static boolean isTrace(String type) {
        return type != null && type.startsWith(TRACE_PREFIX);
    }

    /**
     * 按登记的数据类解析一条要转发给浏览器的事件。
     *
     * @param type 事件类型
     * @param data Python 发来的事件数据
     * @param gson JSON 解析器
     * @return 事件数据对象；类型未登记时返回 null
     */
    public static Object parse(String type, JsonObject data, Gson gson) {
        Class<?> dataClass = type == null ? null : FORWARDED.get(type);
        if (dataClass == null) {
            return null;
        }
        return gson.fromJson(data == null ? new JsonObject() : data, dataClass);
    }

    /**
     * 返回全部对外事件的数据类，供 OpenAPI 注册命名 schema。
     *
     * @return 数据类集合
     */
    public static Collection<Class<?>> dataClasses() {
        return FORWARDED.values();
    }

    private static Map<String, Class<?>> buildForwarded() {
        Map<String, Class<?>> forwarded = new LinkedHashMap<>();
        forwarded.put("run.started", AgentRunStartedEventVO.class);
        forwarded.put("state", AgentStateEventVO.class);
        forwarded.put("tool.started", AgentToolStartedEventVO.class);
        forwarded.put("tool.finished", AgentToolFinishedEventVO.class);
        forwarded.put("reasoning.delta", AgentReasoningDeltaEventVO.class);
        forwarded.put("reasoning.finished", AgentReasoningFinishedEventVO.class);
        forwarded.put("step.note", AgentStepNoteEventVO.class);
        forwarded.put("model.retry", AgentModelRetryEventVO.class);
        forwarded.put("text.delta", AgentTextDeltaEventVO.class);
        forwarded.put("citation", AgentCitationVO.class);
        forwarded.put("usage", AgentUsageVO.class);
        forwarded.put("error", AgentErrorEventVO.class);
        forwarded.put("run.finished", AgentRunFinishedEventVO.class);
        forwarded.put("heartbeat", AgentHeartbeatEventVO.class);
        return Map.copyOf(forwarded);
    }
}
