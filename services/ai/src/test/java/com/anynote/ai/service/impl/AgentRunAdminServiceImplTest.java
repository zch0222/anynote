package com.anynote.ai.service.impl;

import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.mapper.AgentRunEventMapper;
import com.anynote.ai.mapper.AgentRunMapper;
import com.anynote.ai.mapper.AgentTraceAccessMapper;
import com.anynote.ai.mapper.ChatMessageMapper;
import com.anynote.ai.model.po.AgentRunEventPO;
import com.anynote.ai.model.po.AgentRunPO;
import com.anynote.ai.model.po.AgentTraceAccessPO;
import com.anynote.ai.model.vo.AgentRunAdminDetailVO;
import com.anynote.ai.model.vo.AgentRunAdminEventVO;
import com.anynote.ai.model.vo.AgentRunAdminVO;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.model.bo.PageBean;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.pagehelper.Page;
import com.github.pagehelper.PageHelper;
import com.google.gson.Gson;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 管理端 Agent 运行查询单元测试：列表筛选与分页、详情、Trace 事件与访问留痕。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class AgentRunAdminServiceImplTest {

    /**
     * 超出 double 精确范围的纳秒时间戳。
     */
    static final long END_TIME_NANO = 1_800_000_000_000_000_001L;

    @Mock
    private AgentRunMapper runMapper;

    @Mock
    private AgentRunEventMapper eventMapper;

    @Mock
    private AgentTraceAccessMapper accessMapper;

    @Mock
    private ChatMessageMapper messageMapper;

    private AgentRunAdminServiceImpl service;

    @BeforeAll
    static void initTableInfo() {
        if (TableInfoHelper.getTableInfo(AgentRunPO.class) == null) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), AgentRunPO.class);
        }
    }

    @BeforeEach
    void setUp() {
        service = new AgentRunAdminServiceImpl(runMapper, eventMapper, accessMapper, messageMapper,
                new Gson(), new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        PageHelper.clearPage();
    }

    /**
     * 列表把筛选条件传给查询，每页条数最多 100，并带出供应商、工具调用次数与首字时间。
     */
    @Test
    @DisplayName("列表下传筛选、分页上限 100 并带出新增字段")
    void listRunsPassesFiltersAndCapsPageSize() {
        Date from = Date.from(Instant.parse("2026-11-20T00:00:00Z"));
        Date to = Date.from(Instant.parse("2026-11-21T00:00:00Z"));
        when(runMapper.selectAdminList(eq(9L), eq("run-a"), eq("ANSWERED"), eq(from), eq(to))).thenReturn(List.of(
                run("run-a")));

        PageBean<AgentRunAdminVO> page = service.listRuns(2, 999, 9L, " run-a ", "ANSWERED",
                "2026-11-20T00:00:00Z", "2026-11-21T00:00:00Z");

        Page<Object> requested = PageHelper.getLocalPage();
        assertThat(requested.getPageNum()).isEqualTo(2);
        assertThat(requested.getPageSize()).isEqualTo(100);
        AgentRunAdminVO row = page.getRows().get(0);
        assertThat(row.getProvider()).isEqualTo("stepfun");
        assertThat(row.getToolCalls()).isEqualTo(3);
        assertThat(row.getFirstOutputMs()).isEqualTo(420L);
        assertThat(row.getTokenUsage().getTotalTokens()).isEqualTo(12L);
    }

    /**
     * 时间格式不合法时返回参数错误。
     */
    @Test
    @DisplayName("时间格式不合法时拒绝")
    void listRunsRejectsInvalidDate() {
        assertThatThrownBy(() -> service.listRuns(1, 20, null, null, null, "yesterday", null))
                .isInstanceOf(BusinessException.class);
    }

    /**
     * 详情解析落库的过程视图（不带依赖清单），并写一条访问留痕。
     */
    @Test
    @DisplayName("详情解析过程视图并写访问留痕")
    void getRunParsesProcessAndRecordsAccess() {
        when(runMapper.selectOne(any())).thenReturn(run("run-a"));
        ChatMessage answer = new ChatMessage();
        answer.setProcess("{\"version\":1,\"durationMs\":100,\"dependencies\":[\"note:12\"],"
                + "\"items\":[{\"type\":\"reasoning\",\"id\":\"b1\",\"text\":\"想\",\"status\":\"done\"}]}");
        when(messageMapper.selectAssistantByRunId("run-a")).thenReturn(answer);

        AgentRunAdminDetailVO detail = service.getRun("run-a", 42L);

        assertThat(detail.getRun().getRunId()).isEqualTo("run-a");
        assertThat(detail.getProcess().getItems()).hasSize(1);
        assertThat(detail.getProcess().getItems().get(0).getText()).isEqualTo("想");
        ArgumentCaptor<AgentTraceAccessPO> access = ArgumentCaptor.forClass(AgentTraceAccessPO.class);
        verify(accessMapper).insert(access.capture());
        assertThat(access.getValue().getRunId()).isEqualTo("run-a");
        assertThat(access.getValue().getAdminUserId()).isEqualTo(42L);
    }

    /**
     * 事件把 limit 限定在 1 到 500、游标不小于 0，content 解析为 JSON 节点且纳秒时间戳不丢精度，解析失败时原样返回。
     */
    @Test
    @DisplayName("事件分页边界、JSON 节点与访问留痕")
    void listEventsBoundsLimitAndParsesContent() {
        when(runMapper.selectOne(any())).thenReturn(run("run-a"));
        when(eventMapper.selectRunEvents("run-a", 0L, 500)).thenReturn(List.of(
                event(1L, "{\"name\":\"model.call\",\"endTimeUnixNano\":" + END_TIME_NANO + "}"),
                event(2L, "not-json")));
        when(eventMapper.selectRunEvents("run-a", 7L, 1)).thenReturn(List.of());

        List<AgentRunAdminEventVO> events = service.listEvents("run-a", -5, 999, 42L);
        service.listEvents("run-a", 7, 0, 42L);

        JsonNode content = (JsonNode) events.get(0).getContent();
        assertThat(content.get("name").asText()).isEqualTo("model.call");
        assertThat(content.get("endTimeUnixNano").asLong()).isEqualTo(END_TIME_NANO);
        assertThat(events.get(1).getContent()).isEqualTo("not-json");
        verify(accessMapper, times(2)).insert(any(AgentTraceAccessPO.class));
    }

    /**
     * 运行不存在时抛业务异常，不写访问留痕。
     */
    @Test
    @DisplayName("运行不存在时不写留痕")
    void missingRunThrowsWithoutAccessRecord() {
        when(runMapper.selectOne(any())).thenReturn(null);

        assertThatThrownBy(() -> service.getRun("missing", 42L)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.listEvents("missing", 0, 10, 42L)).isInstanceOf(BusinessException.class);
        verify(accessMapper, never()).insert(any(AgentTraceAccessPO.class));
    }

    /**
     * 构造一条运行记录。
     *
     * @param runId 运行标识
     * @return 运行记录
     */
    static AgentRunPO run(String runId) {
        return AgentRunPO.builder()
                .runId(runId)
                .userId(9L)
                .model("agent_main")
                .provider("stepfun")
                .state("COMPLETED")
                .outcome("ANSWERED")
                .tokenUsage("{\"totalTokens\":12,\"known\":true}")
                .toolCalls(3)
                .firstOutputMs(420L)
                .build();
    }

    /**
     * 构造一条落库事件。
     *
     * @param seq 事件序号
     * @param content 事件 JSON
     * @return 事件记录
     */
    static AgentRunEventPO event(long seq, String content) {
        return AgentRunEventPO.builder().runId("run-a").seq(seq).type("trace.model").content(content).build();
    }
}
