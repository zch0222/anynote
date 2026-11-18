package com.anynote.ai.service.impl;

import com.anynote.ai.api.enums.ChatConversationType;
import com.anynote.ai.api.enums.ChatRole;
import com.anynote.ai.api.model.po.ChatConversation;
import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.harness.HarnessClient;
import com.anynote.ai.harness.HarnessClientException;
import com.anynote.ai.harness.dto.HarnessRunCancelDTO;
import com.anynote.ai.mapper.AgentRunEventMapper;
import com.anynote.ai.mapper.AgentRunMapper;
import com.anynote.ai.mapper.ChatConversationMapper;
import com.anynote.ai.mapper.ChatMessageMapper;
import com.anynote.ai.model.dto.AgentRunRequestDTO;
import com.anynote.ai.model.dto.HarnessRunRequestDTO;
import com.anynote.ai.model.po.AgentRunEventPO;
import com.anynote.ai.model.po.AgentRunPO;
import com.anynote.ai.model.vo.AgentRunCancelVO;
import com.anynote.ai.model.vo.AgentRunEventVO;
import com.anynote.ai.model.vo.AgentRunStatusVO;
import com.anynote.ai.properties.AiHarnessProperties;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.run.AiRunLimiter;
import com.anynote.ai.run.DailyRunLimitService;
import com.anynote.ai.run.IndexWatermarkClient;
import com.anynote.ai.service.ChatConversationService;
import com.anynote.ai.service.ChatMessageService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.core.exception.BusinessException;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.function.Consumer;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Agent 运行的消息持久化与失败文案单元测试。
 *
 * @author 称霸幼儿园
 */
class AgentRunServiceImplTest {

    private ChatConversationService conversationService;

    private ChatMessageService messageService;

    private ChatConversationMapper conversationMapper;

    private ChatMessageMapper messageMapper;

    private AgentRunMapper runMapper;

    private AgentRunEventMapper eventMapper;

    private HarnessClient harnessClient;

    private DailyRunLimitService dailyLimitService;

    private IndexWatermarkClient indexWatermarkClient;

    private AiRunLimiter limiter;

    private TransactionTemplate transactionTemplate;

    private SseEmitter emitterOverride;

    private AgentRunServiceImpl service;

    @BeforeEach
    void setUp() {
        conversationService = mock(ChatConversationService.class);
        messageService = mock(ChatMessageService.class);
        conversationMapper = mock(ChatConversationMapper.class);
        messageMapper = mock(ChatMessageMapper.class);
        runMapper = mock(AgentRunMapper.class);
        eventMapper = mock(AgentRunEventMapper.class);
        harnessClient = mock(HarnessClient.class);
        dailyLimitService = mock(DailyRunLimitService.class);
        indexWatermarkClient = mock(IndexWatermarkClient.class);
        limiter = mock(AiRunLimiter.class);
        transactionTemplate = mock(TransactionTemplate.class);

        when(conversationService.getBaseMapper()).thenReturn(conversationMapper);
        when(messageService.getBaseMapper()).thenReturn(messageMapper);
        when(limiter.tryAcquire(9L)).thenReturn(true);
        when(dailyLimitService.reserve(9L)).thenReturn("RAG:COUNT:2026-11-15:9");
        when(indexWatermarkClient.snapshot()).thenReturn(Map.of("status", "ok", "watermark", Map.of()));
        when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        });
        doAnswer(invocation -> {
            ChatConversation conversation = invocation.getArgument(0);
            conversation.setId(42L);
            return 1;
        }).when(conversationMapper).insert(any(ChatConversation.class));

        service = new AgentRunServiceImpl(
                conversationService,
                messageService,
                messageMapper,
                runMapper,
                eventMapper,
                harnessClient,
                indexWatermarkClient,
                limiter,
                dailyLimitService,
                transactionTemplate,
                new AiHarnessProperties(),
                new Gson(),
                (Executor) Runnable::run) {
            @Override
            protected SseEmitter newEmitter() {
                return emitterOverride == null ? super.newEmitter() : emitterOverride;
            }
        };
    }

    /**
     * 历史引用随运行请求下发基础引用与附属类型，供 Python 开跑前复核。
     */
    @Test
    @DisplayName("历史引用下发 ref 与 subtype")
    void harnessHistoryCarriesRefAndSubtype() {
        ChatMessage message = new ChatMessage();
        message.setRole(1);
        message.setContent("旧回答");
        message.setCitations("[" +
                "{\"index\":1,\"sourceId\":\"note:12\",\"title\":\"可读笔记\"}," +
                "{\"index\":2,\"sourceId\":\"mooc_item:5#transcript\",\"title\":\"字幕\"}," +
                "{\"index\":0,\"sourceId\":\"ignored\"}," +
                "{\"title\":\"无编号\"}" +
                "]");
        java.lang.reflect.Method method;
        try {
            method = AgentRunServiceImpl.class.getDeclaredMethod("toHarnessCitations", ChatMessage.class);
        } catch (NoSuchMethodException error) {
            throw new IllegalStateException(error);
        }
        method.setAccessible(true);
        @SuppressWarnings("unchecked")
        java.util.List<HarnessRunRequestDTO.Message.Citation> citations =
                (java.util.List<HarnessRunRequestDTO.Message.Citation>) invokePrivate(method, message);

        assertThat(citations).hasSize(2);
        assertThat(citations.get(0).getRef()).isEqualTo("note:12");
        assertThat(citations.get(0).getSubtype()).isNull();
        assertThat(citations.get(1).getRef()).isEqualTo("mooc_item:5");
        assertThat(citations.get(1).getSubtype()).isEqualTo("transcript");
    }

    private Object invokePrivate(java.lang.reflect.Method method, Object... args) {
        try {
            return method.invoke(service, args);
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException(error);
        }
    }

    /**
     * 保存回答、结构化引用与用量，并将 Trace 留在事件表。
     */
    @Test
    void persistsAnswerCitationsUsageAndTrace() {
        stubSuccessfulRun();

        service.createRun(AgentRunRequestDTO.builder().input("问题").build(), context());

        verify(eventMapper, times(1)).insert(any(AgentRunEventPO.class));
        verify(messageMapper).updateById(org.mockito.ArgumentMatchers.argThat((ChatMessage message) ->
                "答案[1]".equals(message.getContent())
                        && "ANSWERED".equals(message.getOutcome())
                        && message.getCitations().contains("E1")
                        && message.getAnswerNotices().contains("UNSOURCED")));
        verify(runMapper, atLeastOnce()).updateById(org.mockito.ArgumentMatchers.argThat((AgentRunPO run) ->
                "COMPLETED".equals(run.getState())
                        && "ANSWERED".equals(run.getOutcome())
                        && run.getTokenUsage().contains("totalTokens")));
        verify(limiter, atLeastOnce()).acquireDb();
        verify(limiter, atLeastOnce()).releaseDb();
    }

    /**
     * 上游异常只向用户持久化并返回已确认的统一失败提示。
     */
    @Test
    void replacesHarnessFailureTextWithApprovedMessage() {
        doThrow(new HarnessClientException("未确认的上游错误"))
                .when(harnessClient).streamAgentRun(any(), any(), any());

        service.createRun(AgentRunRequestDTO.builder().input("问题").build(), context());

        verify(messageMapper).updateById(org.mockito.ArgumentMatchers.argThat((ChatMessage message) ->
                "服务暂时不可用，请稍后重试".equals(message.getContent())
                        && "FAILED".equals(message.getOutcome())));
        verify(runMapper).updateById(org.mockito.ArgumentMatchers.argThat((AgentRunPO run) ->
                "FAILED".equals(run.getState()) && "FAILED".equals(run.getOutcome())));
    }

    /**
     * 上游错误类别只向用户返回对应的已确认文案。
     *
     * @param category Harness 错误类别
     * @param expectedMessage 用户可见文案
     */
    @ParameterizedTest
    @MethodSource("failureMessages")
    void mapsHarnessFailureCategoryToApprovedMessage(String category, String expectedMessage) {
        AgentRunEventVO[] forwardedError = new AgentRunEventVO[1];
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Consumer<AgentRunEventVO> consumer = invocation.getArgument(2);
            HarnessRunRequestDTO request = invocation.getArgument(1);
            String runId = request.getRunId();
            forwardedError[0] = event(runId, 1, "error", Map.of(
                    "category", category,
                    "retryable", false,
                    "message", "上游内部信息"));
            consumer.accept(forwardedError[0]);
            consumer.accept(event(runId, 2, "run.finished", Map.of(
                    "state", "FAILED",
                    "outcome", "FAILED",
                    "evidence", List.of(),
                    "answerNotices", List.of(),
                    "unfinished", List.of(),
                    "usage", Map.of())));
            return null;
        }).when(harnessClient).streamAgentRun(any(), any(), any());

        service.createRun(AgentRunRequestDTO.builder().input("问题").build(), context());

        assertThat(forwardedError[0].getData()).containsEntry("message", expectedMessage);
    }

    /**
     * 提供错误类别及已确认的用户文案。
     *
     * @return 参数化测试数据
     */
    static Stream<Arguments> failureMessages() {
        return Stream.of(
                Arguments.of("BUDGET_MODEL_TURNS", "这个问题需要的步骤超出了单次上限，可以缩小范围或拆成几个问题再试"),
                Arguments.of("NO_PROGRESS", "这个问题需要的步骤超出了单次上限，可以缩小范围或拆成几个问题再试"),
                Arguments.of("MODEL_TIMEOUT", "模型调用超时，请稍后重试"),
                Arguments.of("MODEL_UNAVAILABLE", "模型服务暂时不可用，请稍后重试"),
                Arguments.of("EMPTY_MODEL_OUTPUT", "模型没有返回内容，请重试"),
                Arguments.of("KNOWLEDGE_ACCESS_UNAVAILABLE", "知识库服务暂时不可用，请稍后重试"),
                Arguments.of("INTERNAL", "服务暂时不可用，请稍后重试"),
                Arguments.of("UNEXPECTED", "服务暂时不可用，请稍后重试"));
    }

    /**
     * 每日额度耗尽时返回事件流并且不创建会话或运行记录。
     */
    @Test
    void rejectsRunWhenDailyQuotaIsExhausted() {
        when(dailyLimitService.reserve(9L)).thenReturn(null);

        service.createRun(AgentRunRequestDTO.builder().input("问题").build(), context());

        verify(limiter).release(9L);
        verify(conversationMapper, never()).insert(any(ChatConversation.class));
        verify(runMapper, never()).insert(any(AgentRunPO.class));
        verify(harnessClient, never()).streamAgentRun(any(), any(), any());
    }

    /**
     * 并发额度耗尽时不占用每日额度且不创建持久化记录。
     */
    @Test
    void rejectsRunWhenConcurrentLimitIsReached() {
        when(limiter.tryAcquire(9L)).thenReturn(false);

        service.createRun(AgentRunRequestDTO.builder().input("问题").build(), context());

        verify(dailyLimitService, never()).reserve(9L);
        verify(conversationMapper, never()).insert(any(ChatConversation.class));
        verify(runMapper, never()).insert(any(AgentRunPO.class));
    }

    /**
     * 不允许读取其他用户的运行记录。
     */
    @Test
    void rejectsRunNotOwnedByCurrentUser() {
        when(runMapper.selectOwned("other-run", 9L)).thenReturn(null);

        org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                () -> service.getRun("other-run", context()));

        verify(messageMapper, never()).selectAssistantByRunId("other-run");
    }

    /**
     * 取消请求转发到 Python 并返回上游受理状态。
     */
    @Test
    void forwardsCancellationToHarness() {
        when(runMapper.selectOwned("active-run", 9L)).thenReturn(AgentRunPO.builder()
                .runId("active-run")
                .userId(9L)
                .state("RUNNING")
                .build());
        when(harnessClient.cancelAgentRun(any(), org.mockito.ArgumentMatchers.eq("active-run")))
                .thenReturn(new HarnessRunCancelDTO("active-run", true, "CANCELLED"));

        AgentRunCancelVO result = service.cancelRun("active-run", context());

        assertThat(result.isAccepted()).isTrue();
        assertThat(result.getState()).isEqualTo("CANCELLED");
        verify(harnessClient).cancelAgentRun(any(), org.mockito.ArgumentMatchers.eq("active-run"));
    }

    /**
     * 查询结果返回持久化回答、引用与 Token 用量。
     */
    @Test
    void returnsPersistedAnswerAndCitations() {
        when(runMapper.selectOwned("done-run", 9L)).thenReturn(AgentRunPO.builder()
                .runId("done-run")
                .conversationId(42L)
                .userId(9L)
                .state("COMPLETED")
                .outcome("ANSWERED")
                .tokenUsage("{\"totalTokens\":12}")
                .build());
        when(messageMapper.selectAssistantByRunId("done-run")).thenReturn(ChatMessage.builder()
                .content("答案[1]")
                .citations("[{\"index\":1,\"evidenceId\":\"E1\"}]")
                .build());

        AgentRunStatusVO result = service.getRun("done-run", context());

        assertThat(result.getConversationId()).isEqualTo(42L);
        assertThat(result.getAnswer()).isEqualTo("答案[1]");
        assertThat(result.getCitations()).hasSize(1);
        assertThat(result.getUsage()).containsEntry("totalTokens", 12.0);
    }

    /**
     * 浏览器断开后继续读取上游事件并落库最终回答。
     */
    @Test
    void continuesPersistingAfterBrowserDisconnects() {
        DisconnectingEmitter disconnected = new DisconnectingEmitter();
        emitterOverride = disconnected;
        stubSuccessfulRun();

        service.createRun(AgentRunRequestDTO.builder().input("问题").build(), context());

        assertThat(disconnected.sendAttempts).isGreaterThan(0);
        verify(eventMapper).insert(any(AgentRunEventPO.class));
        verify(messageMapper).updateById(org.mockito.ArgumentMatchers.argThat((ChatMessage message) ->
                "答案[1]".equals(message.getContent()) && "ANSWERED".equals(message.getOutcome())));
    }

    /**
     * 历史回答的引用编号与标题随消息发送给 Harness。
     */
    @Test
    void sendsHistoricalCitationsToHarness() {
        stubSuccessfulRun();
        when(conversationService.getById(42L)).thenReturn(ChatConversation.builder()
                .id(42L)
                .createBy(9L)
                .type(ChatConversationType.KNOWLEDGE_RETRIEVAL.getValue())
                .build());
        when(messageMapper.selectConversationMessages(42L)).thenReturn(List.of(ChatMessage.builder()
                .orderIndex(0)
                .content("旧回答[1]")
                .role(ChatRole.ASSISTANT.getValue())
                .type(ChatConversationType.KNOWLEDGE_RETRIEVAL.getValue())
                .citations("[{\"index\":1,\"title\":\"旧笔记\"}]")
                .build()));

        service.createRun(AgentRunRequestDTO.builder().conversationId(42L).input("新问题").build(), context());

        org.mockito.ArgumentCaptor<HarnessRunRequestDTO> captor =
                org.mockito.ArgumentCaptor.forClass(HarnessRunRequestDTO.class);
        verify(harnessClient).streamAgentRun(any(), captor.capture(), any());
        HarnessRunRequestDTO.Message history = captor.getValue().getHistory().get(0);
        assertThat(history.getCitations()).hasSize(1);
        assertThat(history.getCitations().get(0).getIndex()).isEqualTo(1);
        assertThat(history.getCitations().get(0).getTitle()).isEqualTo("旧笔记");
    }

    /**
     * 配置 Harness 成功流并覆盖回答、引用、用量和 Trace。
     */
    private void stubSuccessfulRun() {
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Consumer<AgentRunEventVO> consumer = invocation.getArgument(2);
            HarnessRunRequestDTO request = invocation.getArgument(1);
            String runId = request.getRunId();
            consumer.accept(event(runId, 1, "run.started",
                    Map.of("agent", "knowledge-retrieval", "agentVersion", "1")));
            consumer.accept(event(runId, 2, "text.delta", Map.of("delta", "答案[1]")));
            consumer.accept(event(runId, 3, "citation", Map.of("index", 1, "evidenceId", "E1", "snippet", "片段")));
            consumer.accept(event(runId, 4, "usage", Map.of("totalTokens", 12.0, "known", true)));
            consumer.accept(event(runId, 5, "trace.context", Map.of("name", "context.build")));
            consumer.accept(event(runId, 6, "run.finished", Map.of(
                    "state", "COMPLETED",
                    "outcome", "ANSWERED",
                    "evidence", List.of("E1"),
                    "answerNotices", List.of("UNSOURCED"),
                    "unfinished", List.of(),
                    "usage", Map.of("totalTokens", 12.0, "known", true))));
            return null;
        }).when(harnessClient).streamAgentRun(any(), any(), any());
    }

    /**
     * 构造一次 Agent 事件。
     *
     * @param runId 运行标识
     * @param sequence 事件序号
     * @param type 事件类型
     * @param data 事件数据
     * @return 事件信封
     */
    private AgentRunEventVO event(String runId, long sequence, String type, Map<String, Object> data) {
        return AgentRunEventVO.builder()
                .seq(sequence)
                .runId(runId)
                .ts("2026-11-15T00:00:00Z")
                .type(type)
                .data(data)
                .build();
    }

    /**
     * 构造已登录用户上下文。
     *
     * @return 调用上下文
     */
    private AiCallContext context() {
        LoginUser user = new LoginUser();
        user.setUserId(9L);
        return new AiCallContext(user, "access-token");
    }

    private static final class DisconnectingEmitter extends SseEmitter {

        private int sendAttempts;

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            sendAttempts++;
            throw new IOException("disconnected");
        }
    }
}
