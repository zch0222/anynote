package com.anynote.ai.run;

import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.RemoteKnowledgeService;
import com.anynote.note.api.model.dto.KnowledgeAuthorizeBatchDTO;
import com.anynote.note.api.model.vo.KnowledgeAuthorizeBatchVO;
import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 过程视图读取复核：会话详情返回前按当前权限隐藏不可读内容（T1）。
 *
 * <p>全部依赖可读时原样返回；任一不可读时隐藏思考、过程说明与模型生成的对象文字并置
 * hidden 为 true；note 不可用时不返回过程视图（宁可不显示，回答不受影响）。</p>
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class ProcessViewRecheck {

    private static final int BATCH_SIZE = 100;

    private static final String HIDDEN_NOTICE = "部分内容你已无权访问，思考过程已隐藏";

    private static final Type MAP_TYPE = new TypeToken<Map<String, Object>>() { }.getType();

    private final RemoteKnowledgeService remoteKnowledgeService;

    private final Gson gson;

    /**
     * 构造复核服务。
     *
     * @param remoteKnowledgeService note 知识可读性 Feign 客户端
     * @param gson JSON 解析器
     */
    public ProcessViewRecheck(RemoteKnowledgeService remoteKnowledgeService, Gson gson) {
        this.remoteKnowledgeService = remoteKnowledgeService;
        this.gson = gson;
    }

    /**
     * 按当前权限复核一条消息的过程视图。
     *
     * @param message 助手消息
     * @return 复核后的过程视图；不可复核或为空时返回 null
     */
    public Map<String, Object> recheck(ChatMessage message) {
        if (message == null || message.getProcess() == null || message.getProcess().isBlank()) {
            return null;
        }
        Map<String, Object> process;
        try {
            process = gson.fromJson(message.getProcess(), MAP_TYPE);
        } catch (JsonSyntaxException error) {
            return null;
        }
        if (process == null) {
            return null;
        }
        List<String> dependencies = readDependencies(process.get("dependencies"));
        if (dependencies.isEmpty()) {
            return process;
        }
        Set<String> readable = new LinkedHashSet<>();
        try {
            for (int start = 0; start < dependencies.size(); start += BATCH_SIZE) {
                List<String> batch = dependencies.subList(start, Math.min(start + BATCH_SIZE, dependencies.size()));
                ResData<KnowledgeAuthorizeBatchVO> response =
                        remoteKnowledgeService.authorizeBatch(KnowledgeAuthorizeBatchDTO.builder()
                                .refs(batch)
                                .build());
                if (response == null || !"00000".equals(response.getCode())) {
                    return null;
                }
                if (response.getData() != null && response.getData().getReadable() != null) {
                    readable.addAll(response.getData().getReadable());
                }
            }
        } catch (RuntimeException error) {
            log.warn("过程视图复核不可用，不返回过程视图 runId={}", message.getRunId());
            return null;
        }
        if (readable.containsAll(dependencies)) {
            return process;
        }
        return hiddenView(process, readable);
    }

    /**
     * 生成隐藏后的过程视图：思考、过程说明与模型生成的对象文字隐藏，工具结果条目按可读性替换。
     *
     * @param process 原过程视图
     * @param readable 可读实体键集合
     * @return 隐藏后的过程视图
     */
    private Map<String, Object> hiddenView(Map<String, Object> process, Set<String> readable) {
        Map<String, Object> result = new java.util.LinkedHashMap<>(process);
        result.put("hidden", true);
        result.put("hiddenNotice", HIDDEN_NOTICE);
        result.remove("dependencies");
        List<Object> items = new ArrayList<>();
        if (result.get("items") instanceof List<?> list) {
            for (Object entry : list) {
                if (entry instanceof Map<?, ?> item) {
                    items.add(sanitizeItem(item, readable));
                } else {
                    items.add(entry);
                }
            }
        }
        result.put("items", items);
        return result;
    }

    /**
     * 隐藏单行：思考与过程说明整行隐藏，工具行对象按可读性替换、结果条目过滤。
     *
     * @param item 过程行
     * @param readable 可读实体键集合
     * @return 处理后的行
     */
    private Map<String, Object> sanitizeItem(Map<?, ?> item, Set<String> readable) {
        Map<String, Object> copy = new java.util.LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : item.entrySet()) {
            copy.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        String type = String.valueOf(copy.get("type"));
        if ("reasoning".equals(type) || "note".equals(type)) {
            copy.put("text", null);
            return copy;
        }
        if ("tool".equals(type)) {
            Object target = copy.get("target");
            if (target instanceof Map<?, ?> targetMap) {
                boolean resolved = Boolean.TRUE.equals(targetMap.get("resolved"));
                if (resolved) {
                    copy.put("target", null);
                }
            }
            Object resultObj = copy.get("result");
            if (resultObj instanceof Map<?, ?> resultMap) {
                Map<String, Object> sanitizedResult = new java.util.LinkedHashMap<>();
                sanitizedResult.put("count", resultMap.get("count"));
                List<Object> keptItems = new ArrayList<>();
                if (resultMap.get("items") instanceof List<?> resultItems) {
                    for (Object entry : resultItems) {
                        if (entry instanceof Map<?, ?> resultItem
                                && resultItem.get("ref") instanceof String ref
                                && readable.contains(ref)) {
                            keptItems.add(entry);
                        }
                    }
                }
                sanitizedResult.put("items", keptItems);
                copy.put("result", sanitizedResult);
            }
        }
        return copy;
    }

    private List<String> readDependencies(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<String> dependencies = new ArrayList<>();
        for (Object entry : list) {
            if (entry instanceof String item && !item.isBlank()) {
                dependencies.add(item);
            }
        }
        return dependencies;
    }
}
