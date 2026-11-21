package com.anynote.ai.service.impl;

import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.mapper.AgentRunEventMapper;
import com.anynote.ai.mapper.AgentRunMapper;
import com.anynote.ai.mapper.AgentTraceAccessMapper;
import com.anynote.ai.mapper.ChatMessageMapper;
import com.anynote.ai.model.po.AgentRunEventPO;
import com.anynote.ai.model.po.AgentRunPO;
import com.anynote.ai.model.po.AgentTraceAccessPO;
import com.anynote.ai.model.vo.AgentProcessViewVO;
import com.anynote.ai.model.vo.AgentRunAdminDetailVO;
import com.anynote.ai.model.vo.AgentRunAdminEventVO;
import com.anynote.ai.model.vo.AgentRunAdminVO;
import com.anynote.ai.model.vo.AgentUsageVO;
import com.anynote.ai.run.AgentRunProcessView;
import com.anynote.ai.run.ProcessViewRecheck;
import com.anynote.ai.service.AgentRunAdminService;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.PageBean;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.google.gson.Gson;
import com.google.gson.JsonParseException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 管理端 Agent 运行与 Trace 查询实现；详情与事件读取写访问留痕。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class AgentRunAdminServiceImpl implements AgentRunAdminService {

    private static final String RUN_NOT_FOUND_MESSAGE = "运行不存在";

    private static final int MAX_PAGE_SIZE = 100;

    private static final int MAX_EVENT_LIMIT = 500;

    private final AgentRunMapper runMapper;

    private final AgentRunEventMapper eventMapper;

    private final AgentTraceAccessMapper accessMapper;

    private final ChatMessageMapper messageMapper;

    private final Gson gson;

    private final ObjectMapper objectMapper;

    /**
     * 构造管理端查询服务。
     *
     * @param runMapper 运行映射器
     * @param eventMapper 事件映射器
     * @param accessMapper 访问留痕映射器
     * @param messageMapper 消息映射器
     * @param gson 落库 JSON 解析器
     * @param objectMapper Trace 事件 JSON 解析器
     */
    public AgentRunAdminServiceImpl(AgentRunMapper runMapper,
                                    AgentRunEventMapper eventMapper,
                                    AgentTraceAccessMapper accessMapper,
                                    ChatMessageMapper messageMapper,
                                    Gson gson,
                                    ObjectMapper objectMapper) {
        this.runMapper = runMapper;
        this.eventMapper = eventMapper;
        this.accessMapper = accessMapper;
        this.messageMapper = messageMapper;
        this.gson = gson;
        this.objectMapper = objectMapper;
    }

    @Override
    public PageBean<AgentRunAdminVO> listRuns(int pageNum, int pageSize, Long userId, String runId,
                                              String outcome, String startedFrom, String startedTo) {
        Date from = parseDate(startedFrom);
        Date to = parseDate(startedTo);
        PageHelper.startPage(Math.max(1, pageNum), Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE)),
                "started_at DESC");
        List<AgentRunPO> rows = runMapper.selectAdminList(userId, trimToNull(runId),
                trimToNull(outcome), from, to);
        PageInfo<AgentRunPO> page = new PageInfo<>(rows);
        List<AgentRunAdminVO> items = new ArrayList<>();
        for (AgentRunPO row : page.getList()) {
            items.add(toVO(row));
        }
        PageBean<AgentRunAdminVO> result = new PageBean<>();
        result.setCurrent(page.getPageNum());
        result.setPages(page.getPages());
        result.setTotal(page.getTotal());
        result.setRows(items);
        return result;
    }

    @Override
    public AgentRunAdminDetailVO getRun(String runId, Long adminUserId) {
        AgentRunPO run = requireRun(runId);
        recordAccess(runId, adminUserId);
        ChatMessage answer = messageMapper.selectAssistantByRunId(runId);
        return AgentRunAdminDetailVO.builder()
                .run(toVO(run))
                .process(readProcess(answer))
                .build();
    }

    @Override
    public List<AgentRunAdminEventVO> listEvents(String runId, long afterSeq, int limit, Long adminUserId) {
        requireRun(runId);
        recordAccess(runId, adminUserId);
        int boundedLimit = Math.max(1, Math.min(limit, MAX_EVENT_LIMIT));
        List<AgentRunEventPO> rows = eventMapper.selectRunEvents(runId, Math.max(0, afterSeq), boundedLimit);
        List<AgentRunAdminEventVO> items = new ArrayList<>();
        for (AgentRunEventPO row : rows) {
            items.add(AgentRunAdminEventVO.builder()
                    .seq(row.getSeq())
                    .type(row.getType())
                    .content(readContent(row.getContent()))
                    .createTime(row.getCreateTime())
                    .build());
        }
        return items;
    }

    /**
     * 把 Trace 事件 JSON 解析为 Jackson 节点，解析失败时原样返回字符串。
     *
     * @param content 落库的事件 JSON
     * @return JSON 节点或原始字符串
     */
    private Object readContent(String content) {
        if (content == null) {
            return null;
        }
        try {
            return objectMapper.readTree(content);
        } catch (JsonProcessingException error) {
            return content;
        }
    }

    /**
     * 读取该运行落库的过程视图（用户在生成时看到的内容，不做读取复核）。
     *
     * @param answer 助手消息
     * @return 过程视图，没有或无法解析时为 null
     */
    private AgentProcessViewVO readProcess(ChatMessage answer) {
        if (answer == null || answer.getProcess() == null || answer.getProcess().isBlank()) {
            return null;
        }
        try {
            AgentRunProcessView stored = gson.fromJson(answer.getProcess(), AgentRunProcessView.class);
            return stored == null ? null : ProcessViewRecheck.toVisibleView(stored);
        } catch (JsonParseException ignored) {
            return null;
        }
    }

    private AgentRunPO requireRun(String runId) {
        LambdaQueryWrapper<AgentRunPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AgentRunPO::getRunId, runId);
        AgentRunPO run = runMapper.selectOne(wrapper);
        if (run == null) {
            throw new BusinessException(RUN_NOT_FOUND_MESSAGE, ResCode.BUSINESS_ERROR);
        }
        return run;
    }

    private void recordAccess(String runId, Long adminUserId) {
        accessMapper.insert(AgentTraceAccessPO.builder()
                .runId(runId)
                .adminUserId(adminUserId == null ? 0L : adminUserId)
                .createTime(new Date())
                .build());
    }

    private AgentRunAdminVO toVO(AgentRunPO run) {
        return AgentRunAdminVO.builder()
                .runId(run.getRunId())
                .conversationId(run.getConversationId())
                .userId(run.getUserId())
                .agentName(run.getAgentName())
                .agentVersion(run.getAgentVersion())
                .model(run.getModel())
                .provider(run.getProvider())
                .state(run.getState())
                .outcome(run.getOutcome())
                .tokenUsage(readUsage(run.getTokenUsage()))
                .toolCalls(run.getToolCalls())
                .firstOutputMs(run.getFirstOutputMs())
                .durationMs(run.getDurationMs())
                .startedAt(run.getStartedAt())
                .finishedAt(run.getFinishedAt())
                .build();
    }

    private AgentUsageVO readUsage(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return gson.fromJson(json, AgentUsageVO.class);
        } catch (JsonParseException ignored) {
            return null;
        }
    }

    private Date parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Date.from(Instant.parse(value));
        } catch (RuntimeException error) {
            throw new BusinessException("请求参数错误", ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
