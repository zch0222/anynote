package com.anynote.ai.service.impl;

import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.mapper.AgentRunEventMapper;
import com.anynote.ai.mapper.AgentRunMapper;
import com.anynote.ai.mapper.AgentTraceAccessMapper;
import com.anynote.ai.mapper.ChatMessageMapper;
import com.anynote.ai.model.bo.AgentRunStatsRowBO;
import com.anynote.ai.model.po.AgentRunEventPO;
import com.anynote.ai.model.po.AgentRunPO;
import com.anynote.ai.model.po.AgentTraceAccessPO;
import com.anynote.ai.model.vo.AgentRunAdminDetailVO;
import com.anynote.ai.model.vo.AgentRunAdminEventVO;
import com.anynote.ai.model.vo.AgentRunAdminStatsVO;
import com.anynote.ai.model.vo.AgentRunAdminVO;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
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

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
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
     * 空数据集返回零值，并保留完整零值时间桶。
     */
    @Test
    @DisplayName("统计空数据集返回零值")
    void statsReturnsZerosForEmptyDataset() {
        AgentRunAdminServiceImpl fixedService = serviceAt("2026-11-27T02:00:00Z");
        when(runMapper.selectAdminStatsRows(any(), any())).thenReturn(List.of());

        AgentRunAdminStatsVO stats = fixedService.getStats(
                "2026-11-20T00:00:00+08:00", "2026-11-20T23:59:59+08:00", "DAY");

        assertThat(stats.getTotalRuns()).isZero();
        assertThat(stats.getRunningRuns()).isZero();
        assertThat(stats.getSucceededRuns()).isZero();
        assertThat(stats.getFailedRuns()).isZero();
        assertThat(stats.getCancelledRuns()).isZero();
        assertThat(stats.getPromptTokens()).isZero();
        assertThat(stats.getCompletionTokens()).isZero();
        assertThat(stats.getReasoningTokens()).isZero();
        assertThat(stats.getTotalTokens()).isZero();
        assertThat(stats.getAvgDurationMs()).isZero();
        assertThat(stats.getP95DurationMs()).isZero();
        assertThat(stats.getAvgFirstOutputMs()).isZero();
        assertThat(stats.getP95FirstOutputMs()).isZero();
        assertThat(stats.getAvgToolCalls()).isEqualTo(0D);
        assertThat(stats.getOutcomes()).isEmpty();
        assertThat(stats.getModels()).isEmpty();
        assertThat(stats.getSeries()).hasSize(1);
        assertThat(stats.getSeries().get(0).getBucketStart())
                .isEqualTo(Date.from(OffsetDateTime.parse("2026-11-20T00:00:00+08:00").toInstant()));
        assertThat(stats.getSeries().get(0).getTotalRuns()).isZero();
    }

    /**
     * 未传时间时默认查询当前时间往前 7 天，并按天聚合。
     */
    @Test
    @DisplayName("统计默认查询近 7 天并按天聚合")
    void statsUsesDefaultWeekAndDayGranularity() {
        AgentRunAdminServiceImpl fixedService = serviceAt("2026-11-27T02:00:00Z");
        when(runMapper.selectAdminStatsRows(any(), any())).thenReturn(List.of());

        AgentRunAdminStatsVO stats = fixedService.getStats(null, null, null);

        ArgumentCaptor<Date> startedFrom = ArgumentCaptor.forClass(Date.class);
        ArgumentCaptor<Date> startedTo = ArgumentCaptor.forClass(Date.class);
        verify(runMapper).selectAdminStatsRows(startedFrom.capture(), startedTo.capture());
        assertThat(startedFrom.getValue()).isEqualTo(Date.from(Instant.parse("2026-11-20T02:00:00Z")));
        assertThat(startedTo.getValue()).isEqualTo(Date.from(Instant.parse("2026-11-27T02:00:00Z")));
        long spacing = stats.getSeries().get(1).getBucketStart().getTime()
                - stats.getSeries().get(0).getBucketStart().getTime();
        assertThat(spacing).isEqualTo(24L * 60L * 60L * 1000L);
    }

    /**
     * 起止倒置、跨度超限、非法粒度与无时区时间均返回统一参数错误。
     */
    @Test
    @DisplayName("统计拒绝非法时间范围与粒度")
    void statsRejectsInvalidRangeAndGranularity() {
        assertInvalidStats(() -> service.getStats(
                "2026-11-22T00:00:00Z", "2026-11-21T00:00:00Z", null));
        assertInvalidStats(() -> service.getStats(
                "2026-01-01T00:00:00Z", "2026-04-02T00:00:00Z", null));
        assertInvalidStats(() -> service.getStats(
                "2026-11-20T00:00:00Z", "2026-11-21T00:00:00Z", "WEEK"));
        assertInvalidStats(() -> service.getStats(
                "2026-11-20T00:00:00", "2026-11-21T00:00:00Z", null));
    }

    /**
     * 按小时聚合状态、Token、模型分布与时间序列，粒度大小写不敏感。
     */
    @Test
    @DisplayName("统计按小时聚合并汇总 Token 与模型")
    void statsAggregatesHourlyBucketsAndTokenUsage() {
        AgentRunAdminServiceImpl fixedService = serviceAt("2026-11-27T02:00:00Z");
        when(runMapper.selectAdminStatsRows(any(), any())).thenReturn(List.of(
                statsRow("COMPLETED", "ANSWERED", "stepfun", "step-3",
                        "{\"promptTokens\":100,\"completionTokens\":20,\"reasoningTokens\":5,\"totalTokens\":125}",
                        1000L, 100L, 2, "2026-11-20T00:10:00Z"),
                statsRow("FAILED", "ERROR", "openai", "gpt-x",
                        "{\"promptTokens\":200,\"completionTokens\":40,\"reasoningTokens\":10,\"totalTokens\":250}",
                        2000L, 200L, 4, "2026-11-20T01:10:00Z"),
                statsRow("COMPLETED", "NOT_FOUND", null, null,
                        "not-json", null, null, null, "2026-11-20T02:10:00Z"),
                statsRow("COMPLETED", "ANSWERED", "stepfun", "step-3",
                        "{\"promptTokens\":50,\"completionTokens\":15,\"reasoningTokens\":5,\"totalTokens\":70}",
                        3000L, 300L, 3, "2026-11-20T00:40:00Z")));

        AgentRunAdminStatsVO stats = fixedService.getStats(
                "2026-11-20T00:00:00Z", "2026-11-20T02:59:59Z", "hour");

        assertThat(stats.getTotalRuns()).isEqualTo(4L);
        assertThat(stats.getSucceededRuns()).isEqualTo(3L);
        assertThat(stats.getFailedRuns()).isEqualTo(1L);
        assertThat(stats.getPromptTokens()).isEqualTo(350L);
        assertThat(stats.getCompletionTokens()).isEqualTo(75L);
        assertThat(stats.getReasoningTokens()).isEqualTo(20L);
        assertThat(stats.getTotalTokens()).isEqualTo(445L);
        assertThat(stats.getAvgDurationMs()).isEqualTo(2000L);
        assertThat(stats.getP95DurationMs()).isEqualTo(3000L);
        assertThat(stats.getAvgFirstOutputMs()).isEqualTo(200L);
        assertThat(stats.getP95FirstOutputMs()).isEqualTo(300L);
        assertThat(stats.getAvgToolCalls()).isEqualTo(3D);
        assertThat(stats.getOutcomes()).extracting("outcome")
                .containsExactly("ANSWERED", "ERROR", "NOT_FOUND");
        assertThat(stats.getOutcomes().get(0).getCount()).isEqualTo(2L);
        assertThat(stats.getModels().get(0).getProvider()).isEqualTo("stepfun");
        assertThat(stats.getModels().get(0).getRuns()).isEqualTo(2L);
        assertThat(stats.getModels().get(0).getTotalTokens()).isEqualTo(195L);
        assertThat(stats.getModels()).anySatisfy(model -> {
            assertThat(model.getProvider()).isNull();
            assertThat(model.getModel()).isNull();
            assertThat(model.getRuns()).isEqualTo(1L);
        });
        assertThat(stats.getSeries()).hasSize(3);
        assertThat(stats.getSeries().get(0).getTotalRuns()).isEqualTo(2L);
        assertThat(stats.getSeries().get(0).getSucceededRuns()).isEqualTo(2L);
        assertThat(stats.getSeries().get(0).getTotalTokens()).isEqualTo(195L);
        assertThat(stats.getSeries().get(0).getAvgDurationMs()).isEqualTo(2000L);
        assertThat(stats.getSeries().get(1).getFailedRuns()).isEqualTo(1L);
        assertThat(stats.getSeries().get(2).getTotalRuns()).isEqualTo(1L);
    }

    /**
     * 按天聚合时缺失日期补零，NULL 耗时不参与均值，P95 使用 nearest-rank。
     */
    @Test
    @DisplayName("统计按天补零并计算 nearest-rank P95")
    void statsAggregatesDailyBucketsMissingZerosAndP95() {
        AgentRunAdminServiceImpl fixedService = serviceAt("2026-11-27T02:00:00Z");
        List<AgentRunStatsRowBO> rows = new ArrayList<>();
        for (int index = 1; index <= 20; index++) {
            rows.add(statsRow("COMPLETED", "ANSWERED", "stepfun", "step-3",
                    "{\"totalTokens\":10}", index * 100L, index * 10L, 1,
                    index % 2 == 0 ? "2026-11-19T17:00:00Z" : "2026-11-20T17:00:00Z"));
        }
        rows.add(statsRow("FAILED", "ERROR", "stepfun", "step-3", null,
                null, null, null, "2026-11-20T18:00:00Z"));
        when(runMapper.selectAdminStatsRows(any(), any())).thenReturn(rows);

        AgentRunAdminStatsVO stats = fixedService.getStats(
                "2026-11-20T00:00:00+08:00", "2026-11-22T23:59:59+08:00", "DAY");

        assertThat(stats.getTotalRuns()).isEqualTo(21L);
        assertThat(stats.getSucceededRuns()).isEqualTo(20L);
        assertThat(stats.getFailedRuns()).isEqualTo(1L);
        assertThat(stats.getAvgDurationMs()).isEqualTo(1050L);
        assertThat(stats.getP95DurationMs()).isEqualTo(1900L);
        assertThat(stats.getAvgFirstOutputMs()).isEqualTo(105L);
        assertThat(stats.getP95FirstOutputMs()).isEqualTo(190L);
        assertThat(stats.getAvgToolCalls()).isEqualTo(1D);
        assertThat(stats.getTotalTokens()).isEqualTo(200L);
        assertThat(stats.getSeries()).hasSize(3);
        assertThat(stats.getSeries().get(0).getBucketStart())
                .isEqualTo(Date.from(OffsetDateTime.parse("2026-11-20T00:00:00+08:00").toInstant()));
        assertThat(stats.getSeries().get(0).getTotalRuns()).isEqualTo(10L);
        assertThat(stats.getSeries().get(1).getTotalRuns()).isEqualTo(11L);
        assertThat(stats.getSeries().get(1).getFailedRuns()).isEqualTo(1L);
        assertThat(stats.getSeries().get(2).getTotalRuns()).isZero();
        assertThat(stats.getSeries().get(2).getTotalTokens()).isZero();
    }

    /**
     * 断言统计调用抛出统一参数错误。
     *
     * @param callable 统计调用
     */
    private void assertInvalidStats(org.assertj.core.api.ThrowableAssert.ThrowingCallable callable) {
        assertThatThrownBy(callable)
                .isInstanceOf(BusinessException.class)
                .hasMessage("请求参数错误")
                .satisfies(error -> assertThat(((BusinessException) error).getErrorCode())
                        .isEqualTo(ResCode.USER_REQUEST_PARAM_ERROR));
    }

    /**
     * 构造固定时间与时区的统计服务。
     *
     * @param instant 当前时间
     * @return 统计服务
     */
    private AgentRunAdminServiceImpl serviceAt(String instant) {
        ZoneId zoneId = ZoneId.of("Asia/Shanghai");
        return new AgentRunAdminServiceImpl(runMapper, eventMapper, accessMapper, messageMapper,
                new Gson(), new ObjectMapper(), Clock.fixed(Instant.parse(instant), zoneId), zoneId);
    }

    /**
     * 构造一条统计查询行。
     *
     * @param state 运行状态
     * @param outcome 运行结果
     * @param provider 供应商标识
     * @param model 模型标识
     * @param tokenUsage Token JSON
     * @param durationMs 运行耗时
     * @param firstOutputMs 首字耗时
     * @param toolCalls 工具调用次数
     * @param startedAt 开始时间
     * @return 统计查询行
     */
    private static AgentRunStatsRowBO statsRow(String state, String outcome, String provider, String model,
                                               String tokenUsage, Long durationMs, Long firstOutputMs,
                                               Integer toolCalls, String startedAt) {
        AgentRunStatsRowBO row = new AgentRunStatsRowBO();
        row.setState(state);
        row.setOutcome(outcome);
        row.setProvider(provider);
        row.setModel(model);
        row.setTokenUsage(tokenUsage);
        row.setDurationMs(durationMs);
        row.setFirstOutputMs(firstOutputMs);
        row.setToolCalls(toolCalls);
        row.setStartedAt(Date.from(OffsetDateTime.parse(startedAt).toInstant()));
        return row;
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
