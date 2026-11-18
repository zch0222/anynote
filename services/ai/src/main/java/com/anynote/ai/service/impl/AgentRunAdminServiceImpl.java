package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.AgentRunEventMapper;
import com.anynote.ai.mapper.AgentRunMapper;
import com.anynote.ai.mapper.AgentTraceAccessMapper;
import com.anynote.ai.mapper.ChatMessageMapper;
import com.anynote.ai.model.po.AgentRunEventPO;
import com.anynote.ai.model.po.AgentRunPO;
import com.anynote.ai.model.po.AgentTraceAccessPO;
import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.model.vo.AgentRunAdminDetailVO;
import com.anynote.ai.model.vo.AgentRunAdminEventVO;
import com.anynote.ai.model.vo.AgentRunAdminVO;
import com.anynote.ai.service.AgentRunAdminService;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.PageBean;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.google.gson.Gson;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * 管理端 Agent 运行与 Trace 查询实现；详情与事件读取写访问留痕。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class AgentRunAdminServiceImpl implements AgentRunAdminService {

    private static final String RUN_NOT_FOUND_MESSAGE = "运行不存在";

    private static final Type MAP_TYPE = new TypeToken<Map<String, Object>>() { }.getType();

    private final AgentRunMapper runMapper;

    private final AgentRunEventMapper eventMapper;

    private final AgentTraceAccessMapper accessMapper;

    private final ChatMessageMapper messageMapper;

    private final Gson gson;

    /**
     * 构造管理端查询服务。
     *
     * @param runMapper 运行映射器
     * @param eventMapper 事件映射器
     * @param accessMapper 访问留痕映射器
     * @param messageMapper 消息映射器
     * @param gson JSON 解析器
     */
    public AgentRunAdminServiceImpl(AgentRunMapper runMapper,
                                    AgentRunEventMapper eventMapper,
                                    AgentTraceAccessMapper accessMapper,
                                    ChatMessageMapper messageMapper,
                                    Gson gson) {
        this.runMapper = runMapper;
        this.eventMapper = eventMapper;
        this.accessMapper = accessMapper;
        this.messageMapper = messageMapper;
        this.gson = gson;
    }

    @Override
    public PageBean<AgentRunAdminVO> listRuns(int pageNum, int pageSize, Long userId, String runId,
                                              String outcome, String startedFrom, String startedTo) {
        Date from = parseDate(startedFrom);
        Date to = parseDate(startedTo);
        PageHelper.startPage(pageNum, pageSize, "started_at DESC");
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
        Map<String, Object> process = null;
        ChatMessage answer = messageMapper.selectAssistantByRunId(runId);
        if (answer != null && answer.getProcess() != null && !answer.getProcess().isBlank()) {
            try {
                process = gson.fromJson(answer.getProcess(), MAP_TYPE);
            } catch (JsonSyntaxException ignored) {
                // 旧结构过程视图按空返回。
            }
        }
        return AgentRunAdminDetailVO.builder()
                .run(toVO(run))
                .process(process)
                .build();
    }

    @Override
    public List<AgentRunAdminEventVO> listEvents(String runId, long afterSeq, int limit, Long adminUserId) {
        requireRun(runId);
        recordAccess(runId, adminUserId);
        int boundedLimit = Math.max(1, Math.min(limit, 500));
        List<AgentRunEventPO> rows = eventMapper.selectRunEvents(runId, Math.max(0, afterSeq), boundedLimit);
        List<AgentRunAdminEventVO> items = new ArrayList<>();
        for (AgentRunEventPO row : rows) {
            Object content;
            try {
                content = JsonParser.parseString(row.getContent());
            } catch (JsonSyntaxException error) {
                content = row.getContent();
            }
            items.add(AgentRunAdminEventVO.builder()
                    .seq(row.getSeq())
                    .type(row.getType())
                    .content(content)
                    .createTime(row.getCreateTime())
                    .build());
        }
        return items;
    }

    private AgentRunPO requireRun(String runId) {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AgentRunPO> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
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
        Map<String, Object> usage = null;
        if (run.getTokenUsage() != null && !run.getTokenUsage().isBlank()) {
            try {
                usage = gson.fromJson(run.getTokenUsage(), MAP_TYPE);
            } catch (JsonSyntaxException ignored) {
                // 旧结构用量按空返回。
            }
        }
        return AgentRunAdminVO.builder()
                .runId(run.getRunId())
                .conversationId(run.getConversationId())
                .userId(run.getUserId())
                .agentName(run.getAgentName())
                .agentVersion(run.getAgentVersion())
                .model(run.getModel())
                .state(run.getState())
                .outcome(run.getOutcome())
                .tokenUsage(usage)
                .durationMs(run.getDurationMs())
                .startedAt(run.getStartedAt())
                .finishedAt(run.getFinishedAt())
                .build();
    }

    private Date parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Date.from(java.time.Instant.parse(value));
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
