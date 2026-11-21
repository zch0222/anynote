package com.anynote.ai.run;

import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.model.vo.AgentProcessItemVO;
import com.anynote.ai.model.vo.AgentProcessViewVO;
import com.anynote.ai.model.vo.AgentToolResultItemVO;
import com.anynote.ai.model.vo.AgentToolResultVO;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.RemoteKnowledgeService;
import com.anynote.note.api.model.dto.KnowledgeAuthorizeBatchDTO;
import com.anynote.note.api.model.vo.KnowledgeAuthorizeBatchVO;
import com.google.gson.Gson;
import com.google.gson.JsonParseException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 过程视图读取复核：会话详情返回前按当前权限复核整段会话的过程视图（T1）。
 *
 * <p>先收集整段会话的依赖并去重，每 100 条批量复核一次，再按消息判定：依赖全部可读时返回契约字段；
 * 任一不可读时隐藏思考、过程说明与模型生成的对象文字并置 hidden；note 不可用时有依赖的过程视图不返回。</p>
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class ProcessViewRecheck {

    private static final int BATCH_SIZE = 100;

    private static final String SUCCESS_CODE = "00000";

    private static final String HIDDEN_NOTICE = "部分内容你已无权访问，思考过程已隐藏";

    private static final String TYPE_REASONING = "reasoning";

    private static final String TYPE_NOTE = "note";

    private static final String TYPE_TOOL = "tool";

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
     * 按当前权限复核一组消息的过程视图。
     *
     * @param messages 会话消息
     * @return 与输入同序的过程视图；没有过程视图或无法复核的位置为 null
     */
    public List<AgentProcessViewVO> recheckAll(List<ChatMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        List<AgentRunProcessView> stored = new ArrayList<>(messages.size());
        Set<String> dependencies = new LinkedHashSet<>();
        for (ChatMessage message : messages) {
            AgentRunProcessView view = parse(message);
            stored.add(view);
            if (view != null) {
                dependencies.addAll(dependenciesOf(view));
            }
        }
        Set<String> readable = authorize(new ArrayList<>(dependencies));
        List<AgentProcessViewVO> result = new ArrayList<>(messages.size());
        for (AgentRunProcessView view : stored) {
            result.add(view == null ? null : judge(view, readable));
        }
        return result;
    }

    /**
     * 把落库视图转换为发给浏览器的视图：保留全部行与文字。
     *
     * @param view 落库的过程视图
     * @return 只含契约字段的过程视图
     */
    public static AgentProcessViewVO toVisibleView(AgentRunProcessView view) {
        return AgentProcessViewVO.builder()
                .version(view.getVersion())
                .durationMs(view.getDurationMs())
                .hidden(false)
                .toolCalls(view.getToolCalls())
                .firstOutputMs(view.getFirstOutputMs())
                .items(view.getItems() == null ? new ArrayList<>() : new ArrayList<>(view.getItems()))
                .build();
    }

    private AgentProcessViewVO judge(AgentRunProcessView view, Set<String> readable) {
        List<String> dependencies = dependenciesOf(view);
        if (dependencies.isEmpty()) {
            return toVisibleView(view);
        }
        if (readable == null) {
            return null;
        }
        return readable.containsAll(dependencies) ? toVisibleView(view) : hiddenView(view, readable);
    }

    private AgentRunProcessView parse(ChatMessage message) {
        if (message == null || message.getProcess() == null || message.getProcess().isBlank()) {
            return null;
        }
        try {
            return gson.fromJson(message.getProcess(), AgentRunProcessView.class);
        } catch (JsonParseException error) {
            return null;
        }
    }

    /**
     * 批量确认可读实体键。
     *
     * @param dependencies 去重后的实体键
     * @return 可读实体键；note 不可用时为 null
     */
    private Set<String> authorize(List<String> dependencies) {
        Set<String> readable = new LinkedHashSet<>();
        if (dependencies.isEmpty()) {
            return readable;
        }
        try {
            for (int start = 0; start < dependencies.size(); start += BATCH_SIZE) {
                List<String> batch = dependencies.subList(start, Math.min(start + BATCH_SIZE, dependencies.size()));
                ResData<KnowledgeAuthorizeBatchVO> response = remoteKnowledgeService.authorizeBatch(
                        KnowledgeAuthorizeBatchDTO.builder().refs(new ArrayList<>(batch)).build());
                if (response == null || !SUCCESS_CODE.equals(response.getCode())) {
                    return null;
                }
                if (response.getData() != null && response.getData().getReadable() != null) {
                    readable.addAll(response.getData().getReadable());
                }
            }
        } catch (RuntimeException error) {
            log.warn("过程视图复核不可用，不返回带依赖的过程视图 cause={}", error.getClass().getSimpleName());
            return null;
        }
        return readable;
    }

    /**
     * 生成隐藏后的过程视图：思考与过程说明去掉文字，工具行去掉已解析的对象文字、结果条目只留可读项。
     *
     * @param view 落库的过程视图
     * @param readable 可读实体键
     * @return 隐藏后的过程视图
     */
    private AgentProcessViewVO hiddenView(AgentRunProcessView view, Set<String> readable) {
        List<AgentProcessItemVO> items = new ArrayList<>();
        for (AgentProcessItemVO item : view.getItems() == null ? List.<AgentProcessItemVO>of() : view.getItems()) {
            items.add(hideItem(item, readable));
        }
        return AgentProcessViewVO.builder()
                .version(view.getVersion())
                .durationMs(view.getDurationMs())
                .hidden(true)
                .hiddenNotice(HIDDEN_NOTICE)
                .toolCalls(view.getToolCalls())
                .firstOutputMs(view.getFirstOutputMs())
                .items(items)
                .build();
    }

    private AgentProcessItemVO hideItem(AgentProcessItemVO item, Set<String> readable) {
        AgentProcessItemVO copy = AgentProcessItemVO.builder()
                .type(item.getType())
                .id(item.getId())
                .text(item.getText())
                .status(item.getStatus())
                .durationMs(item.getDurationMs())
                .name(item.getName())
                .target(item.getTarget())
                .result(item.getResult())
                .build();
        if (TYPE_REASONING.equals(item.getType()) || TYPE_NOTE.equals(item.getType())) {
            copy.setText(null);
            return copy;
        }
        if (TYPE_TOOL.equals(item.getType())) {
            if (item.getTarget() != null && Boolean.TRUE.equals(item.getTarget().getResolved())) {
                copy.setTarget(null);
            }
            if (item.getResult() != null) {
                List<AgentToolResultItemVO> kept = new ArrayList<>();
                for (AgentToolResultItemVO entry : item.getResult().getItems() == null
                        ? List.<AgentToolResultItemVO>of() : item.getResult().getItems()) {
                    if (entry.getRef() != null && readable.contains(entry.getRef())) {
                        kept.add(entry);
                    }
                }
                copy.setResult(AgentToolResultVO.builder().count(item.getResult().getCount()).items(kept).build());
            }
        }
        return copy;
    }

    private static List<String> dependenciesOf(AgentRunProcessView view) {
        if (view.getDependencies() == null) {
            return Collections.emptyList();
        }
        List<String> dependencies = new ArrayList<>();
        for (String dependency : view.getDependencies()) {
            if (dependency != null && !dependency.isBlank()) {
                dependencies.add(dependency);
            }
        }
        return dependencies;
    }
}
