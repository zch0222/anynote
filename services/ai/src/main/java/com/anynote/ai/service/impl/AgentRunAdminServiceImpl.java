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
import com.anynote.ai.model.vo.AgentProcessViewVO;
import com.anynote.ai.model.vo.AgentRunAdminDetailVO;
import com.anynote.ai.model.vo.AgentRunAdminEventVO;
import com.anynote.ai.model.vo.AgentRunAdminStatsVO;
import com.anynote.ai.model.vo.AgentRunAdminVO;
import com.anynote.ai.model.vo.AgentRunModelBucketVO;
import com.anynote.ai.model.vo.AgentRunOutcomeCountVO;
import com.anynote.ai.model.vo.AgentRunTimeBucketVO;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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

    private static final String INVALID_REQUEST_MESSAGE = "请求参数错误";

    private static final String STATE_RUNNING = "RUNNING";

    private static final String STATE_COMPLETED = "COMPLETED";

    private static final String STATE_FAILED = "FAILED";

    private static final String STATE_CANCELLED = "CANCELLED";

    private static final String GRANULARITY_HOUR = "HOUR";

    private static final String GRANULARITY_DAY = "DAY";

    private static final Duration DEFAULT_STATS_RANGE = Duration.ofDays(7);

    private static final Duration MAX_STATS_RANGE = Duration.ofDays(90);

    private static final Duration HOUR_GRANULARITY_MAX_RANGE = Duration.ofHours(48);

    private static final int MAX_PAGE_SIZE = 100;

    private static final int MAX_EVENT_LIMIT = 500;

    private final AgentRunMapper runMapper;

    private final AgentRunEventMapper eventMapper;

    private final AgentTraceAccessMapper accessMapper;

    private final ChatMessageMapper messageMapper;

    private final Gson gson;

    private final ObjectMapper objectMapper;

    private final Clock clock;

    private final ZoneId zoneId;

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
    @Autowired
    public AgentRunAdminServiceImpl(AgentRunMapper runMapper,
                                    AgentRunEventMapper eventMapper,
                                    AgentTraceAccessMapper accessMapper,
                                    ChatMessageMapper messageMapper,
                                    Gson gson,
                                    ObjectMapper objectMapper) {
        this(runMapper, eventMapper, accessMapper, messageMapper, gson, objectMapper,
                Clock.systemDefaultZone(), ZoneId.systemDefault());
    }

    /**
     * 构造带时间源的管理端查询服务。
     *
     * @param runMapper 运行映射器
     * @param eventMapper 事件映射器
     * @param accessMapper 访问留痕映射器
     * @param messageMapper 消息映射器
     * @param gson 落库 JSON 解析器
     * @param objectMapper Trace 事件 JSON 解析器
     * @param clock 当前时间源
     * @param zoneId 时间桶时区
     */
    AgentRunAdminServiceImpl(AgentRunMapper runMapper,
                             AgentRunEventMapper eventMapper,
                             AgentTraceAccessMapper accessMapper,
                             ChatMessageMapper messageMapper,
                             Gson gson,
                             ObjectMapper objectMapper,
                             Clock clock,
                             ZoneId zoneId) {
        this.runMapper = runMapper;
        this.eventMapper = eventMapper;
        this.accessMapper = accessMapper;
        this.messageMapper = messageMapper;
        this.gson = gson;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.zoneId = zoneId;
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
    public AgentRunAdminStatsVO getStats(String startedFrom, String startedTo, String granularity) {
        Instant to = parseStatsInstant(startedTo);
        if (to == null) {
            to = clock.instant();
        }
        Instant from = parseStatsInstant(startedFrom);
        if (from == null) {
            from = to.minus(DEFAULT_STATS_RANGE);
        }
        if (from.isAfter(to)) {
            throw invalidStatsRequest();
        }
        Duration range = Duration.between(from, to);
        if (range.compareTo(MAX_STATS_RANGE) > 0) {
            throw invalidStatsRequest();
        }
        String resolvedGranularity = resolveGranularity(granularity, range);
        List<AgentRunStatsRowBO> rows = runMapper.selectAdminStatsRows(Date.from(from), Date.from(to));
        return buildStats(rows, from, to, resolvedGranularity);
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
     * 按查询行构建运行聚合统计。
     *
     * @param rows 统计查询行
     * @param from 开始时间下界
     * @param to 开始时间上界
     * @param granularity 时间桶粒度
     * @return 聚合统计
     */
    private AgentRunAdminStatsVO buildStats(List<AgentRunStatsRowBO> rows, Instant from, Instant to,
                                            String granularity) {
        long runningRuns = 0L;
        long succeededRuns = 0L;
        long failedRuns = 0L;
        long cancelledRuns = 0L;
        long promptTokens = 0L;
        long completionTokens = 0L;
        long reasoningTokens = 0L;
        long totalTokens = 0L;
        long durationSum = 0L;
        long durationCount = 0L;
        long firstOutputSum = 0L;
        long firstOutputCount = 0L;
        long toolCallSum = 0L;
        long toolCallCount = 0L;
        List<Long> durations = new ArrayList<>();
        List<Long> firstOutputs = new ArrayList<>();
        Map<String, Long> outcomeCounts = new HashMap<>();
        Map<ModelKey, ModelBucketAccumulator> modelBuckets = new HashMap<>();
        Map<Instant, TimeBucketAccumulator> timeBuckets = createTimeBuckets(from, to, granularity);

        for (AgentRunStatsRowBO row : rows) {
            if (STATE_RUNNING.equals(row.getState())) {
                runningRuns++;
            } else if (STATE_COMPLETED.equals(row.getState())) {
                succeededRuns++;
            } else if (STATE_FAILED.equals(row.getState())) {
                failedRuns++;
            } else if (STATE_CANCELLED.equals(row.getState())) {
                cancelledRuns++;
            }
            if (row.getOutcome() != null) {
                outcomeCounts.merge(row.getOutcome(), 1L, Long::sum);
            }

            AgentUsageVO usage = readUsage(row.getTokenUsage());
            long rowTotalTokens = usage == null ? 0L : zeroIfNull(usage.getTotalTokens());
            if (usage != null) {
                promptTokens += zeroIfNull(usage.getPromptTokens());
                completionTokens += zeroIfNull(usage.getCompletionTokens());
                reasoningTokens += zeroIfNull(usage.getReasoningTokens());
                totalTokens += zeroIfNull(usage.getTotalTokens());
            }

            if (row.getDurationMs() != null) {
                durationSum += row.getDurationMs();
                durationCount++;
                durations.add(row.getDurationMs());
            }
            if (row.getFirstOutputMs() != null) {
                firstOutputSum += row.getFirstOutputMs();
                firstOutputCount++;
                firstOutputs.add(row.getFirstOutputMs());
            }
            if (row.getToolCalls() != null) {
                toolCallSum += row.getToolCalls();
                toolCallCount++;
            }

            ModelKey modelKey = new ModelKey(row.getProvider(), row.getModel());
            ModelBucketAccumulator modelBucket = modelBuckets.computeIfAbsent(modelKey, key -> new ModelBucketAccumulator());
            modelBucket.runs++;
            modelBucket.totalTokens += rowTotalTokens;

            TimeBucketAccumulator timeBucket = timeBuckets.get(bucketStart(row.getStartedAt().toInstant(), granularity).toInstant());
            if (timeBucket != null) {
                timeBucket.totalRuns++;
                if (STATE_COMPLETED.equals(row.getState())) {
                    timeBucket.succeededRuns++;
                } else if (STATE_FAILED.equals(row.getState())) {
                    timeBucket.failedRuns++;
                }
                timeBucket.totalTokens += rowTotalTokens;
                if (row.getDurationMs() != null) {
                    timeBucket.durationSum += row.getDurationMs();
                    timeBucket.durationCount++;
                }
            }
        }

        return AgentRunAdminStatsVO.builder()
                .totalRuns((long) rows.size())
                .runningRuns(runningRuns)
                .succeededRuns(succeededRuns)
                .failedRuns(failedRuns)
                .cancelledRuns(cancelledRuns)
                .promptTokens(promptTokens)
                .completionTokens(completionTokens)
                .reasoningTokens(reasoningTokens)
                .totalTokens(totalTokens)
                .avgDurationMs(roundedAverage(durationSum, durationCount))
                .p95DurationMs(nearestRankP95(durations))
                .avgFirstOutputMs(roundedAverage(firstOutputSum, firstOutputCount))
                .p95FirstOutputMs(nearestRankP95(firstOutputs))
                .avgToolCalls(toolCallCount == 0 ? 0D : toolCallSum / (double) toolCallCount)
                .outcomes(toOutcomeCounts(outcomeCounts))
                .models(toModelBuckets(modelBuckets))
                .series(toTimeBuckets(timeBuckets))
                .build();
    }

    /**
     * 创建时间范围内的完整时间桶，缺失桶后续保持零值。
     *
     * @param from 开始时间下界
     * @param to 开始时间上界
     * @param granularity 时间桶粒度
     * @return 按时间升序排列的时间桶
     */
    private Map<Instant, TimeBucketAccumulator> createTimeBuckets(Instant from, Instant to, String granularity) {
        Map<Instant, TimeBucketAccumulator> buckets = new LinkedHashMap<>();
        ZonedDateTime cursor = bucketStart(from, granularity);
        while (!cursor.toInstant().isAfter(to)) {
            buckets.put(cursor.toInstant(), new TimeBucketAccumulator());
            cursor = GRANULARITY_HOUR.equals(granularity) ? cursor.plusHours(1) : cursor.plusDays(1);
        }
        return buckets;
    }

    /**
     * 按服务端时区把时间对齐到小时或自然日开始。
     *
     * @param instant 待对齐时间
     * @param granularity 时间桶粒度
     * @return 时间桶开始时间
     */
    private ZonedDateTime bucketStart(Instant instant, String granularity) {
        ZonedDateTime time = instant.atZone(zoneId);
        if (GRANULARITY_HOUR.equals(granularity)) {
            return time.truncatedTo(ChronoUnit.HOURS);
        }
        return time.toLocalDate().atStartOfDay(zoneId);
    }

    /**
     * 转换结果分布并按次数降序、名称升序排序。
     *
     * @param outcomeCounts 结果计数
     * @return 结果分布
     */
    private List<AgentRunOutcomeCountVO> toOutcomeCounts(Map<String, Long> outcomeCounts) {
        List<AgentRunOutcomeCountVO> outcomes = new ArrayList<>();
        outcomeCounts.forEach((outcome, count) -> outcomes.add(AgentRunOutcomeCountVO.builder()
                .outcome(outcome)
                .count(count)
                .build()));
        outcomes.sort((left, right) -> {
            int countOrder = Long.compare(right.getCount(), left.getCount());
            return countOrder != 0 ? countOrder : left.getOutcome().compareTo(right.getOutcome());
        });
        return outcomes;
    }

    /**
     * 转换模型调用分布。
     *
     * @param modelBuckets 模型分组统计
     * @return 模型调用分布
     */
    private List<AgentRunModelBucketVO> toModelBuckets(Map<ModelKey, ModelBucketAccumulator> modelBuckets) {
        List<ModelKey> keys = new ArrayList<>(modelBuckets.keySet());
        keys.sort((left, right) -> {
            long leftRuns = modelBuckets.get(left).runs;
            long rightRuns = modelBuckets.get(right).runs;
            int runOrder = Long.compare(rightRuns, leftRuns);
            if (runOrder != 0) {
                return runOrder;
            }
            int providerOrder = compareNullable(left.provider(), right.provider());
            return providerOrder != 0 ? providerOrder : compareNullable(left.model(), right.model());
        });
        List<AgentRunModelBucketVO> models = new ArrayList<>();
        for (ModelKey key : keys) {
            ModelBucketAccumulator bucket = modelBuckets.get(key);
            models.add(AgentRunModelBucketVO.builder()
                    .provider(key.provider())
                    .model(key.model())
                    .runs(bucket.runs)
                    .totalTokens(bucket.totalTokens)
                    .build());
        }
        return models;
    }

    /**
     * 转换时间序列统计。
     *
     * @param timeBuckets 时间桶统计
     * @return 按时间升序排列的序列
     */
    private List<AgentRunTimeBucketVO> toTimeBuckets(Map<Instant, TimeBucketAccumulator> timeBuckets) {
        List<AgentRunTimeBucketVO> series = new ArrayList<>();
        timeBuckets.forEach((bucketStart, bucket) -> series.add(AgentRunTimeBucketVO.builder()
                .bucketStart(Date.from(bucketStart))
                .totalRuns(bucket.totalRuns)
                .succeededRuns(bucket.succeededRuns)
                .failedRuns(bucket.failedRuns)
                .totalTokens(bucket.totalTokens)
                .avgDurationMs(roundedAverage(bucket.durationSum, bucket.durationCount))
                .build()));
        return series;
    }

    /**
     * 计算四舍五入后的整数平均值，无有效样本时返回 0。
     *
     * @param sum 样本总和
     * @param count 样本数量
     * @return 整数平均值
     */
    private long roundedAverage(long sum, long count) {
        return count == 0 ? 0L : Math.round(sum / (double) count);
    }

    /**
     * 使用 nearest-rank 计算 P95，无有效样本时返回 0。
     *
     * @param values 样本值
     * @return P95 值
     */
    private long nearestRankP95(List<Long> values) {
        if (values.isEmpty()) {
            return 0L;
        }
        List<Long> sorted = new ArrayList<>(values);
        sorted.sort(Long::compareTo);
        int index = (int) Math.ceil(sorted.size() * 0.95D) - 1;
        return sorted.get(index);
    }

    /**
     * 解析带时区偏移的 ISO-8601 时间。
     *
     * @param value 查询参数
     * @return 时间 instant，参数为空时为 null
     */
    private Instant parseStatsInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(value.trim()).toInstant();
        } catch (DateTimeParseException error) {
            throw invalidStatsRequest();
        }
    }

    /**
     * 归一化时间桶粒度。
     *
     * @param granularity 查询参数
     * @param range 查询时间跨度
     * @return 时间桶粒度
     */
    private String resolveGranularity(String granularity, Duration range) {
        if (granularity == null || granularity.isBlank()) {
            return range.compareTo(HOUR_GRANULARITY_MAX_RANGE) <= 0 ? GRANULARITY_HOUR : GRANULARITY_DAY;
        }
        String normalized = granularity.trim().toUpperCase(Locale.ROOT);
        if (!GRANULARITY_HOUR.equals(normalized) && !GRANULARITY_DAY.equals(normalized)) {
            throw invalidStatsRequest();
        }
        return normalized;
    }

    private BusinessException invalidStatsRequest() {
        return new BusinessException(INVALID_REQUEST_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
    }

    private long zeroIfNull(Long value) {
        return value == null ? 0L : value;
    }

    private int compareNullable(String left, String right) {
        if (left == null && right == null) {
            return 0;
        }
        if (left == null) {
            return 1;
        }
        if (right == null) {
            return -1;
        }
        return left.compareTo(right);
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
            throw new BusinessException(INVALID_REQUEST_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private record ModelKey(String provider, String model) {
    }

    private static final class ModelBucketAccumulator {

        private long runs;

        private long totalTokens;
    }

    private static final class TimeBucketAccumulator {

        private long totalRuns;

        private long succeededRuns;

        private long failedRuns;

        private long totalTokens;

        private long durationSum;

        private long durationCount;
    }
}
