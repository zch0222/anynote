package com.anynote.ai.service.impl;

import com.anynote.ai.api.enums.ChatConversationType;
import com.anynote.ai.api.enums.ChatRole;
import com.anynote.ai.api.model.dto.DocQueryDTO;
import com.anynote.ai.api.model.po.ChatConversation;
import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.harness.HarnessClient;
import com.anynote.ai.harness.HarnessClientException;
import com.anynote.ai.harness.dto.HarnessRunCancelDTO;
import com.anynote.ai.harness.vo.HarnessRunEventVO;
import com.anynote.ai.harness.vo.HarnessTraceDependenciesVO;
import com.anynote.ai.mapper.AgentRunEventMapper;
import com.anynote.ai.mapper.AgentRunMapper;
import com.anynote.ai.mapper.ChatMessageMapper;
import com.anynote.ai.model.bo.LogicalModelProviderBO;
import com.anynote.ai.model.dto.AgentRunRequestDTO;
import com.anynote.ai.model.dto.AgentRunScopeDTO;
import com.anynote.ai.model.dto.HarnessRunRequestDTO;
import com.anynote.ai.model.po.AgentRunEventPO;
import com.anynote.ai.model.po.AgentRunPO;
import com.anynote.ai.model.vo.AgentCitationVO;
import com.anynote.ai.model.vo.AgentErrorEventVO;
import com.anynote.ai.model.vo.AgentIndexWatermarkVO;
import com.anynote.ai.model.vo.AgentRunCancelVO;
import com.anynote.ai.model.vo.AgentRunEventVO;
import com.anynote.ai.model.vo.AgentRunFinishedEventVO;
import com.anynote.ai.model.vo.AgentRunStartedEventVO;
import com.anynote.ai.model.vo.AgentRunStatusVO;
import com.anynote.ai.model.vo.AgentStateEventVO;
import com.anynote.ai.model.vo.AgentTextDeltaEventVO;
import com.anynote.ai.model.vo.AgentUsageVO;
import com.anynote.ai.properties.AiHarnessProperties;
import com.anynote.ai.run.AgentRunEventTypes;
import com.anynote.ai.run.AgentRunProcessView;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.run.AiRunLimiter;
import com.anynote.ai.run.DailyRunLimitService;
import com.anynote.ai.run.IndexWatermarkClient;
import com.anynote.ai.service.AgentRunService;
import com.anynote.ai.service.ChatConversationService;
import com.anynote.ai.service.ChatMessageService;
import com.anynote.ai.service.ModelProviderService;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.reflect.TypeToken;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.lang.reflect.Type;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.function.Supplier;

/**
 * 知识检索 Agent 运行、事件转发与结果持久化。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class AgentRunServiceImpl implements AgentRunService {

    private static final String AGENT_NAME = "knowledge-retrieval";

    private static final String AGENT_VERSION = "1";

    private static final String SERVICE_UNAVAILABLE_MESSAGE = "服务暂时不可用，请稍后重试";

    private static final String BUDGET_EXHAUSTED_MESSAGE = "这个问题需要的步骤超出了单次上限，可以缩小范围或拆成几个问题再试";

    private static final String MODEL_TIMEOUT_MESSAGE = "模型调用超时，请稍后重试";

    private static final String MODEL_UNAVAILABLE_MESSAGE = "模型服务暂时不可用，请稍后重试";

    private static final String EMPTY_MODEL_OUTPUT_MESSAGE = "模型没有返回内容，请重试";

    private static final String KNOWLEDGE_ACCESS_UNAVAILABLE_MESSAGE = "知识库服务暂时不可用，请稍后重试";

    private static final String CONCURRENCY_LIMIT_MESSAGE = "当前使用人数较多，请稍后再试";

    private static final String DAILY_LIMIT_MESSAGE = "今日 AI 问答次数已达上限，请明天再试。";

    private static final int DEFAULT_PROCESS_REASONING_MAX_CHARS = 8000;

    private static final String TRACE_DEPENDENCIES = "trace.dependencies";

    private static final String CANCELLED = "CANCELLED";

    private static final Type CITATIONS_TYPE = new TypeToken<List<AgentCitationVO>>() { }.getType();

    private final ChatConversationService conversationService;

    private final ChatMessageService messageService;

    private final ChatMessageMapper messageMapper;

    private final AgentRunMapper runMapper;

    private final AgentRunEventMapper eventMapper;

    private final HarnessClient harnessClient;

    private final IndexWatermarkClient indexWatermarkClient;

    private final AiRunLimiter runLimiter;

    private final DailyRunLimitService dailyRunLimitService;

    private final TransactionTemplate transactionTemplate;

    private final AiHarnessProperties harnessProperties;

    private final ModelProviderService modelProviderService;

    private final Gson gson;

    private final Executor ioExecutor;

    /**
     * 构造 Agent 运行服务。
     *
     * @param conversationService 会话服务
     * @param messageService 消息服务
     * @param messageMapper 消息映射器
     * @param runMapper 运行映射器
     * @param eventMapper 运行事件映射器
     * @param harnessClient Python Harness 客户端
     * @param indexWatermarkClient 索引水位客户端
     * @param runLimiter 并发运行限制器
     * @param dailyRunLimitService 每日运行次数限制器
     * @param transactionTemplate 短事务模板
     * @param harnessProperties Harness 调用配置
     * @param modelProviderService 模型供应商服务，用于解析逻辑模型绑定的供应商
     * @param gson JSON 序列化器
     * @param ioExecutor I/O 执行器
     */
    public AgentRunServiceImpl(ChatConversationService conversationService,
                               ChatMessageService messageService,
                               ChatMessageMapper messageMapper,
                               AgentRunMapper runMapper,
                               AgentRunEventMapper eventMapper,
                               HarnessClient harnessClient,
                               IndexWatermarkClient indexWatermarkClient,
                               AiRunLimiter runLimiter,
                               DailyRunLimitService dailyRunLimitService,
                               TransactionTemplate transactionTemplate,
                               AiHarnessProperties harnessProperties,
                               ModelProviderService modelProviderService,
                               Gson gson,
                               @Qualifier("ioExecutor") Executor ioExecutor) {
        this.conversationService = conversationService;
        this.messageService = messageService;
        this.messageMapper = messageMapper;
        this.runMapper = runMapper;
        this.eventMapper = eventMapper;
        this.harnessClient = harnessClient;
        this.indexWatermarkClient = indexWatermarkClient;
        this.runLimiter = runLimiter;
        this.dailyRunLimitService = dailyRunLimitService;
        this.transactionTemplate = transactionTemplate;
        this.harnessProperties = harnessProperties;
        this.modelProviderService = modelProviderService;
        this.gson = gson;
        this.ioExecutor = ioExecutor;
    }

    /**
     * 创建知识检索运行并返回 SSE 事件流。
     *
     * @param request 运行请求
     * @param context 调用身份上下文
     * @return SSE 事件流
     */
    @Override
    public SseEmitter createRun(AgentRunRequestDTO request, AiCallContext context) {
        if (request.getAgent() != null && !AGENT_NAME.equals(request.getAgent())) {
            throw new BusinessException("请求参数错误", ResCode.USER_REQUEST_PARAM_ERROR);
        }
        String runId = UUID.randomUUID().toString();
        if (!runLimiter.tryAcquire(context.getUserId())) {
            return immediateFailure(runId, "CONCURRENCY_LIMIT", true, CONCURRENCY_LIMIT_MESSAGE);
        }
        String quotaKey = dailyRunLimitService.reserve(context.getUserId());
        if (quotaKey == null) {
            runLimiter.release(context.getUserId());
            return immediateFailure(runId, "DAILY_LIMIT", false, DAILY_LIMIT_MESSAGE);
        }

        RunSetup setup;
        try {
            setup = transactionTemplate.execute(status ->
                    withDbPermit(() -> openRun(runId, request, context)));
            if (setup == null) {
                throw new IllegalStateException("Agent 运行事务未返回结果");
            }
        } catch (RuntimeException error) {
            dailyRunLimitService.release(quotaKey);
            runLimiter.release(context.getUserId());
            throw error;
        }

        SseEmitter emitter = newEmitter();
        try {
            ioExecutor.execute(() -> relayRun(runId, setup, context, emitter));
        } catch (RuntimeException error) {
            completeFailure(runId, setup, emitter, new RelayState(), "SERVICE_UNAVAILABLE", true);
            dailyRunLimitService.release(quotaKey);
            runLimiter.release(context.getUserId());
        }
        return emitter;
    }

    /**
     * 创建限定单个 PDF 资料范围的运行。
     *
     * @param request PDF 问答请求
     * @param context 调用身份上下文
     * @return SSE 事件流
     */
    @Override
    public SseEmitter createDocumentRun(DocQueryDTO request, AiCallContext context) {
        AgentRunScopeDTO scope = AgentRunScopeDTO.builder()
                .knowledgeBaseIds(List.of())
                .refs(List.of("doc:" + request.getDocId()))
                .build();
        AgentRunRequestDTO runRequest = AgentRunRequestDTO.builder()
                .conversationId(request.getConversationId())
                .input(request.getPrompt())
                .agent(AGENT_NAME)
                .scope(scope)
                .build();
        return createRun(runRequest, context);
    }

    /**
     * 取消当前用户拥有的运行。
     *
     * @param runId 运行标识
     * @param context 调用身份上下文
     * @return 取消结果
     */
    @Override
    public AgentRunCancelVO cancelRun(String runId, AiCallContext context) {
        AgentRunPO run = findOwnedRun(runId, context.getUserId());
        if (isTerminal(run.getState())) {
            return AgentRunCancelVO.builder()
                    .runId(runId)
                    .accepted(false)
                    .state(run.getState())
                    .build();
        }
        try {
            HarnessRunCancelDTO response = harnessClient.cancelAgentRun(context, runId);
            return AgentRunCancelVO.builder()
                    .runId(response.getRunId())
                    .accepted(response.isAccepted())
                    .state(response.getState())
                    .build();
        } catch (HarnessClientException error) {
            throw new BusinessException(SERVICE_UNAVAILABLE_MESSAGE, ResCode.BUSINESS_ERROR);
        }
    }

    /**
     * 查询当前用户拥有的运行状态与结果。
     *
     * @param runId 运行标识
     * @param context 调用身份上下文
     * @return 运行状态与结果
     */
    @Override
    public AgentRunStatusVO getRun(String runId, AiCallContext context) {
        AgentRunPO run = findOwnedRun(runId, context.getUserId());
        ChatMessage answer = withDbPermit(() -> messageMapper.selectAssistantByRunId(runId));
        return AgentRunStatusVO.builder()
                .runId(run.getRunId())
                .conversationId(run.getConversationId())
                .state(run.getState())
                .outcome(run.getOutcome())
                .answer(answer == null ? null : answer.getContent())
                .citations(readCitations(answer))
                .usage(readUsage(run.getTokenUsage()))
                .startedAt(run.getStartedAt() == null ? null : run.getStartedAt().toInstant())
                .finishedAt(run.getFinishedAt() == null ? null : run.getFinishedAt().toInstant())
                .build();
    }

    private RunSetup openRun(String runId, AgentRunRequestDTO request, AiCallContext context) {
        Long userId = context.getUserId();
        Date now = new Date();
        ChatConversation conversation;
        List<ChatMessage> history;
        if (request.getConversationId() == null) {
            String title = request.getInput().substring(0, Math.min(request.getInput().length(), 10));
            conversation = ChatConversation.builder()
                    .title(title)
                    .type(ChatConversationType.KNOWLEDGE_RETRIEVAL.getValue())
                    .scope(gson.toJson(normalizeScope(request.getScope(), null)))
                    .permissions("70000")
                    .deleted(0)
                    .createBy(userId)
                    .createTime(now)
                    .updateBy(userId)
                    .updateTime(now)
                    .build();
            conversationService.getBaseMapper().insert(conversation);
            history = new ArrayList<>();
        } else {
            conversation = conversationService.getById(request.getConversationId());
            if (conversation == null || !Objects.equals(conversation.getCreateBy(), userId)
                    || !Objects.equals(conversation.getType(), ChatConversationType.KNOWLEDGE_RETRIEVAL.getValue())) {
                throw new BusinessException(ResCode.BUSINESS_ERROR);
            }
            history = messageMapper.selectConversationMessages(conversation.getId());
            AgentRunScopeDTO scope = normalizeScope(request.getScope(), conversation.getScope());
            if (request.getScope() != null) {
                conversation.setScope(gson.toJson(scope));
                conversation.setUpdateBy(userId);
                conversation.setUpdateTime(now);
                conversationService.getBaseMapper().updateById(conversation);
            }
        }

        AgentRunScopeDTO scope = normalizeScope(request.getScope(), conversation.getScope());
        List<HarnessRunRequestDTO.Message> harnessHistory = toHarnessHistory(history);
        int nextOrder = history.isEmpty() ? 0 : history.get(history.size() - 1).getOrderIndex() + 1;
        ChatMessage userMessage = ChatMessage.builder()
                .conversationId(conversation.getId())
                .orderIndex(nextOrder)
                .content(request.getInput())
                .role(ChatRole.USER.getValue())
                .type(ChatConversationType.KNOWLEDGE_RETRIEVAL.getValue())
                .docId(null)
                .deleted(0)
                .createBy(userId)
                .createTime(now)
                .updateBy(userId)
                .updateTime(now)
                .build();
        messageService.getBaseMapper().insert(userMessage);

        ChatMessage answerMessage = ChatMessage.builder()
                .conversationId(conversation.getId())
                .orderIndex(nextOrder + 1)
                .content("")
                .runId(runId)
                .role(ChatRole.ASSISTANT.getValue())
                .type(ChatConversationType.KNOWLEDGE_RETRIEVAL.getValue())
                .docId(null)
                .deleted(0)
                .createBy(userId)
                .createTime(now)
                .updateBy(userId)
                .updateTime(now)
                .build();
        messageService.getBaseMapper().insert(answerMessage);

        AgentRunPO run = AgentRunPO.builder()
                .runId(runId)
                .conversationId(conversation.getId())
                .userId(userId)
                .agentName(AGENT_NAME)
                .agentVersion(AGENT_VERSION)
                .model(request.getModel())
                .state("RUNNING")
                .startedAt(now)
                .build();
        runMapper.insert(run);
        request.setConversationId(conversation.getId());
        HarnessRunRequestDTO harnessRequest = HarnessRunRequestDTO.builder()
                .runId(runId)
                .input(request.getInput())
                .agent(AGENT_NAME)
                .conversationId(conversation.getId())
                .history(harnessHistory)
                .scope(scope)
                .model(request.getModel())
                .build();
        return new RunSetup(conversation.getId(), answerMessage, run, harnessRequest);
    }

    private void relayRun(String runId, RunSetup setup, AiCallContext context, SseEmitter emitter) {
        RelayState state = new RelayState();
        try {
            AgentIndexWatermarkVO watermark = indexWatermarkClient.snapshot();
            harnessClient.streamAgentRun(context, setup.harnessRequest(), event ->
                    handleEvent(event, setup, emitter, state, watermark));
            if (!state.finished) {
                completeFailure(runId, setup, emitter, state, "SERVICE_UNAVAILABLE", true);
            }
        } catch (Exception error) {
            log.warn("Agent 运行失败 runId={} cause={}", runId, error.getClass().getSimpleName());
            if (!state.finished) {
                completeFailure(runId, setup, emitter, state, "SERVICE_UNAVAILABLE", true);
            }
        } finally {
            emitter.complete();
            runLimiter.release(setup.run().getUserId());
        }
    }

    /**
     * 处理一条 Python 事件：Trace 只落库；登记过的事件按数据类解析后累积过程视图并转发给浏览器。
     *
     * @param event Python 事件
     * @param setup 本次运行的持久化对象
     * @param emitter 浏览器事件流
     * @param state 转发状态
     * @param watermark 运行开始时的索引状态
     */
    private void handleEvent(HarnessRunEventVO event, RunSetup setup, SseEmitter emitter,
                             RelayState state, AgentIndexWatermarkVO watermark) {
        if (event == null || event.getType() == null) {
            return;
        }
        state.lastSequence = event.getSeq() == null ? state.lastSequence : event.getSeq();
        JsonObject raw = event.getData() == null ? new JsonObject() : event.getData();
        if (AgentRunEventTypes.isTrace(event.getType())) {
            withDbPermit(() -> {
                eventMapper.insert(AgentRunEventPO.builder()
                        .runId(event.getRunId())
                        .seq(event.getSeq())
                        .type(event.getType())
                        .content(gson.toJson(raw))
                        .createTime(new Date())
                        .build());
                return null;
            });
            if (TRACE_DEPENDENCIES.equals(event.getType())) {
                HarnessTraceDependenciesVO dependencies = gson.fromJson(raw, HarnessTraceDependenciesVO.class);
                if (dependencies != null && dependencies.getDependencies() != null) {
                    state.dependencies.addAll(dependencies.getDependencies());
                }
            }
            return;
        }
        Object data = AgentRunEventTypes.parse(event.getType(), raw, gson);
        if (data == null) {
            return;
        }
        state.process.accumulate(data);
        switch (data) {
            case AgentRunStartedEventVO started -> onRunStarted(started, setup, state, watermark);
            case AgentTextDeltaEventVO text -> {
                if (text.getDelta() != null) {
                    state.answer.append(text.getDelta());
                }
            }
            case AgentCitationVO citation -> state.citations.add(citation);
            case AgentStateEventVO runState -> {
                if (runState.getState() != null) {
                    setup.run().setState(runState.getState());
                    withDbPermit(() -> {
                        runMapper.updateById(setup.run());
                        return null;
                    });
                }
            }
            case AgentUsageVO usage -> {
                state.usage = usage;
                setup.run().setTokenUsage(gson.toJson(usage));
                withDbPermit(() -> {
                    runMapper.updateById(setup.run());
                    return null;
                });
            }
            case AgentErrorEventVO error -> {
                if (CANCELLED.equals(error.getCategory())) {
                    return;
                }
                error.setMessage(userErrorMessage(error.getCategory()));
            }
            case AgentRunFinishedEventVO finished -> {
                persistFinished(setup, state, finished);
                state.finished = true;
            }
            default -> {
            }
        }
        sendEvent(emitter, event(event.getRunId(), event.getSeq(), event.getType(), event.getTs(), data));
    }

    /**
     * 运行开始：补会话与索引状态，记录 Agent、模型与逻辑模型绑定的供应商。
     *
     * @param started run.started 事件数据
     * @param setup 本次运行的持久化对象
     * @param state 转发状态
     * @param watermark 运行开始时的索引状态
     */
    private void onRunStarted(AgentRunStartedEventVO started, RunSetup setup, RelayState state,
                              AgentIndexWatermarkVO watermark) {
        started.setConversationId(setup.conversationId());
        started.setIndexWatermark(watermark);
        if (started.getAgent() != null) {
            setup.run().setAgentName(started.getAgent());
        }
        if (started.getAgentVersion() != null) {
            setup.run().setAgentVersion(started.getAgentVersion());
        }
        if (started.getModel() != null) {
            setup.run().setModel(started.getModel());
        }
        LogicalModelProviderBO provider = withDbPermit(() ->
                modelProviderService.resolveLogicalModel(started.getModel()));
        if (provider != null) {
            setup.run().setProvider(provider.getProviderKey());
            if (provider.getProcessReasoningMaxChars() != null) {
                state.reasoningMaxChars = provider.getProcessReasoningMaxChars();
            }
        }
        withDbPermit(() -> {
            runMapper.updateById(setup.run());
            return null;
        });
    }

    private void persistFinished(RunSetup setup, RelayState state, AgentRunFinishedEventVO finished) {
        Date now = new Date();
        String runState = finished.getState() == null ? "FAILED" : finished.getState();
        String outcome = finished.getOutcome() == null ? "FAILED" : finished.getOutcome();
        if (finished.getUsage() != null) {
            state.usage = finished.getUsage();
            setup.run().setTokenUsage(gson.toJson(finished.getUsage()));
        }
        state.answerNotices = finished.getAnswerNotices() == null ? List.of() : finished.getAnswerNotices();
        setup.run().setState(runState);
        setup.run().setOutcome(outcome);
        setup.run().setFinishedAt(now);
        setup.run().setDurationMs(Math.max(0L, now.getTime() - setup.run().getStartedAt().getTime()));
        setup.run().setToolCalls(finished.getToolCalls());
        setup.run().setFirstOutputMs(finished.getFirstOutputMs());
        finished.setDurationMs(setup.run().getDurationMs());
        state.process.setDurationMs(setup.run().getDurationMs());
        state.process.setToolCalls(finished.getToolCalls());
        state.process.setFirstOutputMs(finished.getFirstOutputMs());
        withDbPermitVoid(() -> {
            runMapper.updateById(setup.run());
            saveAnswer(setup.answerMessage(), state, outcome, now);
        });
    }

    private void completeFailure(String runId, RunSetup setup, SseEmitter emitter,
                                 RelayState state, String category, boolean retryable) {
        Date now = new Date();
        setup.run().setState("FAILED");
        setup.run().setOutcome("FAILED");
        setup.run().setFinishedAt(now);
        setup.run().setDurationMs(Math.max(0L, now.getTime() - setup.run().getStartedAt().getTime()));
        if (state.answer.isEmpty()) {
            state.answer.append(SERVICE_UNAVAILABLE_MESSAGE);
        }
        state.process.setDurationMs(setup.run().getDurationMs());
        withDbPermitVoid(() -> {
            runMapper.updateById(setup.run());
            saveAnswer(setup.answerMessage(), state, "FAILED", now);
        });

        long errorSequence = state.lastSequence + 1;
        sendEvent(emitter, event(runId, errorSequence, "error", null, AgentErrorEventVO.builder()
                .category(category)
                .retryable(retryable)
                .message(SERVICE_UNAVAILABLE_MESSAGE)
                .build()));
        sendEvent(emitter, event(runId, errorSequence + 1, "run.finished", null, failedRunFinished(state.usage)));
        state.lastSequence = errorSequence + 1;
        state.finished = true;
    }

    private void saveAnswer(ChatMessage answerMessage, RelayState state, String outcome, Date updatedAt) {
        answerMessage.setContent(state.answer.toString());
        answerMessage.setCitations(gson.toJson(state.citations));
        answerMessage.setAnswerNotices(gson.toJson(state.answerNotices));
        answerMessage.setOutcome(outcome);
        AgentRunProcessView view = state.process;
        view.complete(state.reasoningMaxChars);
        if (view.hasItems()) {
            view.getDependencies().addAll(state.dependencies);
            answerMessage.setProcess(gson.toJson(view));
        }
        answerMessage.setUpdateTime(updatedAt);
        messageMapper.updateById(answerMessage);
    }

    private SseEmitter immediateFailure(String runId, String category, boolean retryable, String message) {
        SseEmitter emitter = newEmitter();
        sendEvent(emitter, event(runId, 1L, "error", null, AgentErrorEventVO.builder()
                .category(category)
                .retryable(retryable)
                .message(message)
                .build()));
        sendEvent(emitter, event(runId, 2L, "run.finished", null, failedRunFinished(null)));
        emitter.complete();
        return emitter;
    }

    private AgentRunFinishedEventVO failedRunFinished(AgentUsageVO usage) {
        return AgentRunFinishedEventVO.builder()
                .state("FAILED")
                .outcome("FAILED")
                .evidence(List.of())
                .answerNotices(List.of())
                .unfinished(List.of())
                .usage(usage == null ? new AgentUsageVO() : usage)
                .build();
    }

    private AgentRunEventVO event(String runId, Long seq, String type, String ts, Object data) {
        return AgentRunEventVO.builder()
                .seq(seq)
                .runId(runId)
                .ts(ts == null ? Instant.now().toString() : ts)
                .type(type)
                .data(data)
                .build();
    }

    private void sendEvent(SseEmitter emitter, AgentRunEventVO event) {
        try {
            emitter.send(SseEmitter.event()
                    .id(String.valueOf(event.getSeq()))
                    .name(event.getType())
                    .data(event));
        } catch (IOException | IllegalStateException ignored) {
            // 浏览器断开后仍消费上游并完成落库。
        }
    }

    private AgentRunPO findOwnedRun(String runId, Long userId) {
        AgentRunPO run = withDbPermit(() -> runMapper.selectOwned(runId, userId));
        if (run == null) {
            throw new BusinessException(ResCode.BUSINESS_ERROR);
        }
        return run;
    }

    private <T> T withDbPermit(Supplier<T> action) {
        runLimiter.acquireDb();
        try {
            return action.get();
        } finally {
            runLimiter.releaseDb();
        }
    }

    private void withDbPermitVoid(Runnable action) {
        runLimiter.acquireDb();
        try {
            action.run();
        } finally {
            runLimiter.releaseDb();
        }
    }

    protected SseEmitter newEmitter() {
        return new SseEmitter(harnessProperties.getTotalTimeout().toMillis() + 30_000L);
    }

    private boolean isTerminal(String state) {
        return "COMPLETED".equals(state) || "FAILED".equals(state) || "CANCELLED".equals(state);
    }

    private AgentRunScopeDTO normalizeScope(AgentRunScopeDTO requested, String savedJson) {
        if (requested != null) {
            return requested;
        }
        if (savedJson != null && !savedJson.isBlank()) {
            AgentRunScopeDTO saved = gson.fromJson(savedJson, AgentRunScopeDTO.class);
            if (saved != null) {
                if (saved.getKnowledgeBaseIds() == null) {
                    saved.setKnowledgeBaseIds(new ArrayList<>());
                }
                if (saved.getRefs() == null) {
                    saved.setRefs(new ArrayList<>());
                }
                return saved;
            }
        }
        return AgentRunScopeDTO.builder().knowledgeBaseIds(new ArrayList<>()).refs(new ArrayList<>()).build();
    }

    private List<HarnessRunRequestDTO.Message> toHarnessHistory(List<ChatMessage> messages) {
        List<HarnessRunRequestDTO.Message> history = new ArrayList<>();
        if (messages == null) {
            return history;
        }
        for (ChatMessage message : messages) {
            if (message.getContent() == null || message.getContent().isBlank()) {
                continue;
            }
            String role = message.getRole() == ChatRole.USER.getValue() ? "user" : "assistant";
            history.add(HarnessRunRequestDTO.Message.builder()
                    .role(role)
                    .content(message.getContent())
                    .citations(toHarnessCitations(message))
                    .dependencies(readDependencies(message))
                    .build());
        }
        return history;
    }

    /**
     * 将持久化引用转换为 Harness 历史引用。
     *
     * @param message 历史消息
     * @return 正整数编号及其来源标题
     */
    private List<HarnessRunRequestDTO.Message.Citation> toHarnessCitations(ChatMessage message) {
        List<HarnessRunRequestDTO.Message.Citation> citations = new ArrayList<>();
        for (AgentCitationVO item : readCitations(message)) {
            if (item.getIndex() == null || item.getIndex() <= 0) {
                continue;
            }
            citations.add(HarnessRunRequestDTO.Message.Citation.builder()
                    .index(item.getIndex())
                    .title(item.getTitle())
                    .build());
        }
        return citations;
    }

    /**
     * 读取历史回答所在运行落库的依赖清单。
     *
     * @param message 历史消息
     * @return 实体键列表，没有过程视图时为空
     */
    private List<String> readDependencies(ChatMessage message) {
        if (message.getProcess() == null || message.getProcess().isBlank()) {
            return List.of();
        }
        try {
            AgentRunProcessView view = gson.fromJson(message.getProcess(), AgentRunProcessView.class);
            return view == null || view.getDependencies() == null ? List.of() : view.getDependencies();
        } catch (JsonParseException ignored) {
            return List.of();
        }
    }

    private List<AgentCitationVO> readCitations(ChatMessage answer) {
        if (answer == null || answer.getCitations() == null || answer.getCitations().isBlank()) {
            return List.of();
        }
        try {
            List<AgentCitationVO> citations = gson.fromJson(answer.getCitations(), CITATIONS_TYPE);
            return citations == null ? List.of() : citations;
        } catch (JsonParseException ignored) {
            return List.of();
        }
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

    /**
     * 将 Harness 错误类别映射为已确认的用户文案。
     *
     * @param category 上游错误类别
     * @return 用户可见错误文案
     */
    private String userErrorMessage(String category) {
        String value = category == null ? "" : category;
        if (value.startsWith("BUDGET_")) {
            return BUDGET_EXHAUSTED_MESSAGE;
        }
        return switch (value) {
            case "NO_PROGRESS" -> BUDGET_EXHAUSTED_MESSAGE;
            case "MODEL_TIMEOUT" -> MODEL_TIMEOUT_MESSAGE;
            case "MODEL_UNAVAILABLE" -> MODEL_UNAVAILABLE_MESSAGE;
            case "EMPTY_MODEL_OUTPUT" -> EMPTY_MODEL_OUTPUT_MESSAGE;
            case "KNOWLEDGE_ACCESS_UNAVAILABLE" -> KNOWLEDGE_ACCESS_UNAVAILABLE_MESSAGE;
            default -> SERVICE_UNAVAILABLE_MESSAGE;
        };
    }

    private record RunSetup(Long conversationId, ChatMessage answerMessage, AgentRunPO run,
                            HarnessRunRequestDTO harnessRequest) {
    }

    private static final class RelayState {

        private final StringBuilder answer = new StringBuilder();

        private final List<AgentCitationVO> citations = new ArrayList<>();

        private final List<String> dependencies = new ArrayList<>();

        private final AgentRunProcessView process = new AgentRunProcessView();

        private int reasoningMaxChars = DEFAULT_PROCESS_REASONING_MAX_CHARS;

        private List<String> answerNotices = List.of();

        private long lastSequence;

        private AgentUsageVO usage;

        private boolean finished;
    }
}
