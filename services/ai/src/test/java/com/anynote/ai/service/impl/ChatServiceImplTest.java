package com.anynote.ai.service.impl;

import com.anynote.ai.api.model.bo.ChatConversationUpdateParam;
import com.anynote.ai.api.model.dto.ChatCompletionsDTO;
import com.anynote.ai.api.model.po.ChatConversation;
import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.harness.HarnessClient;
import com.anynote.ai.harness.HarnessClientException;
import com.anynote.ai.harness.vo.FastApiChatCompletionsVO;
import com.anynote.ai.mapper.ChatConversationMapper;
import com.anynote.ai.mapper.ChatMessageMapper;
import com.anynote.ai.properties.AiHarnessProperties;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.run.AiRunLimiter;
import com.anynote.ai.service.ChatConversationService;
import com.anynote.ai.service.ChatMessageService;
import com.anynote.ai.service.MoocVideoSummarizeService;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.RemoteFileService;
import com.anynote.note.api.RemoteMoocService;
import com.anynote.note.api.RemoteNoteTaskService;
import com.anynote.system.api.RemoteSysApiStatisticsService;
import com.anynote.system.api.model.bo.LoginUser;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link ChatServiceImpl} 单元测试：登录用户来自显式上下文、流式转发与结束时落库。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChatServiceImplTest {

    @Mock
    private ChatConversationService chatConversationService;

    @Mock
    private ChatMessageService chatMessageService;

    @Mock
    private ChatConversationMapper chatConversationMapper;

    @Mock
    private ChatMessageMapper chatMessageMapper;

    @Mock
    private MoocVideoSummarizeService moocVideoSummarizeService;

    @Mock
    private TransactionTemplate transactionTemplate;

    @Mock
    private HarnessClient harnessClient;

    @Mock
    private RemoteMoocService remoteMoocService;

    @Mock
    private RemoteFileService remoteFileService;

    @Mock
    private RemoteNoteTaskService remoteNoteTaskService;

    @Mock
    private RemoteSysApiStatisticsService remoteSysApiStatisticsService;

    @Mock
    private AiRunLimiter aiRunLimiter;

    private StubChatServiceImpl chatService;

    private AiCallContext context;

    @BeforeEach
    void setUp() {
        chatService = new StubChatServiceImpl();
        ReflectionTestUtils.setField(chatService, "chatConversationService", chatConversationService);
        ReflectionTestUtils.setField(chatService, "chatMessageService", chatMessageService);
        ReflectionTestUtils.setField(chatService, "moocVideoSummarizeService", moocVideoSummarizeService);
        ReflectionTestUtils.setField(chatService, "transactionTemplate", transactionTemplate);
        ReflectionTestUtils.setField(chatService, "harnessClient", harnessClient);
        ReflectionTestUtils.setField(chatService, "gson", new Gson());
        ReflectionTestUtils.setField(chatService, "remoteMoocService", remoteMoocService);
        ReflectionTestUtils.setField(chatService, "remoteFileService", remoteFileService);
        ReflectionTestUtils.setField(chatService, "remoteNoteTaskService", remoteNoteTaskService);
        ReflectionTestUtils.setField(chatService, "remoteSysApiStatisticsService", remoteSysApiStatisticsService);
        ReflectionTestUtils.setField(chatService, "aiRunLimiter", aiRunLimiter);
        ReflectionTestUtils.setField(chatService, "aiHarnessProperties", new AiHarnessProperties());
        ReflectionTestUtils.setField(chatService, "ioExecutor", (Executor) Runnable::run);

        when(chatConversationService.getBaseMapper()).thenReturn(chatConversationMapper);
        when(chatMessageService.getBaseMapper()).thenReturn(chatMessageMapper);
        when(transactionTemplate.execute(any())).thenAnswer(invocation ->
                ((TransactionCallback<?>) invocation.getArgument(0)).doInTransaction(null));
        doAnswer(invocation -> {
            java.util.function.Consumer<org.springframework.transaction.TransactionStatus> action =
                    invocation.getArgument(0);
            action.accept(null);
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());
        when(aiRunLimiter.tryAcquire(anyLong())).thenReturn(true);
        when(remoteSysApiStatisticsService.increaseUsage(any(), anyString()))
                .thenReturn(ResData.success("ok"));
        doAnswer(invocation -> {
            ChatConversation conversation = invocation.getArgument(0);
            conversation.setId(100L);
            return 1;
        }).when(chatConversationMapper).insert(any(ChatConversation.class));
        when(chatMessageMapper.insert(any(ChatMessage.class))).thenReturn(1);

        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(9L);
        context = new AiCallContext(loginUser, "user-token");
    }

    @Test
    @DisplayName("新会话：使用上下文中的登录用户，流结束后保存助手消息")
    void savesAnswerMessageAfterStream() {
        stubStream(chunk("你"), chunk("好"));

        chatService.chatCompletions(chatCompletions("你好"), context);

        ArgumentCaptor<ChatConversation> conversationCaptor = ArgumentCaptor.forClass(ChatConversation.class);
        verify(chatConversationMapper).insert(conversationCaptor.capture());
        assertThat(conversationCaptor.getValue().getCreateBy()).isEqualTo(9L);

        ArgumentCaptor<ChatMessage> messageCaptor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageMapper, org.mockito.Mockito.times(2)).insert(messageCaptor.capture());
        List<ChatMessage> inserted = messageCaptor.getAllValues();
        assertThat(inserted.get(0).getContent()).isEqualTo("你好");
        assertThat(inserted.get(1).getContent()).isEqualTo("你好");
        assertThat(chatService.emitter.dataEvents()).hasSize(2);
        verify(aiRunLimiter).release(9L);
    }

    @Test
    @DisplayName("上游失败：发送失败帧，助手消息仍在 finally 中落库")
    void persistsAnswerEvenWhenStreamFails() {
        doAnswer(invocation -> {
            Consumer<FastApiChatCompletionsVO> consumer = invocation.getArgument(2);
            consumer.accept(chunk("部分"));
            throw new HarnessClientException("boom");
        }).when(harnessClient).streamChat(any(), any(), any());

        chatService.chatCompletions(chatCompletions("你好"), context);

        ArgumentCaptor<ChatMessage> messageCaptor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageMapper, org.mockito.Mockito.times(2)).insert(messageCaptor.capture());
        ChatMessage answer = messageCaptor.getAllValues().get(1);
        assertThat(answer.getContent()).isEqualTo("部分\n出现异常请稍后重试");
        assertThat(chatService.emitter.dataEvents()).hasSize(2);
        verify(aiRunLimiter).release(9L);
    }

    @Test
    @DisplayName("并发达到上限：返回约定提示且不落库")
    void returnsConcurrencyLimitMessage() {
        when(aiRunLimiter.tryAcquire(anyLong())).thenReturn(false);

        chatService.chatCompletions(chatCompletions("你好"), context);

        verify(chatConversationMapper, never()).insert(any(ChatConversation.class));
        assertThat(chatService.emitter.dataEvents()).hasSize(1);
        assertThat(chatService.emitter.dataEvents().get(0).toString()).contains("当前使用人数较多，请稍后再试");
        verify(aiRunLimiter, never()).release(anyLong());
    }

    @Test
    @DisplayName("已有会话：读取历史消息后追加提问并保存回答")
    void continuesExistingConversation() {
        ChatConversation conversation = ChatConversation.builder()
                .id(5L)
                .title("历史会话")
                .type(1)
                .permissions("70000")
                .deleted(0)
                .createBy(9L)
                .build();
        when(chatConversationService.getById(5L)).thenReturn(conversation);
        ChatMessage history = ChatMessage.builder()
                .id(1L)
                .conversationId(5L)
                .orderIndex(0)
                .content("上一轮")
                .role(0)
                .type(1)
                .docId(0L)
                .deleted(0)
                .build();
        when(chatMessageService.list(org.mockito.ArgumentMatchers.<com.baomidou.mybatisplus.core.conditions.Wrapper<ChatMessage>>any())).thenReturn(new ArrayList<>(Collections.singletonList(history)));
        stubStream(chunk("回答"));

        ChatCompletionsDTO dto = chatCompletions("继续");
        dto.setConversationId(5L);
        chatService.authedChatCompletions(dto, context);

        verify(chatConversationMapper, never()).insert(any(ChatConversation.class));
        ArgumentCaptor<ChatMessage> messageCaptor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageMapper, org.mockito.Mockito.times(2)).insert(messageCaptor.capture());
        assertThat(messageCaptor.getAllValues().get(0).getOrderIndex()).isEqualTo(1);
        assertThat(messageCaptor.getAllValues().get(1).getContent()).isEqualTo("回答");
    }

    @Test
    @DisplayName("更新会话标题返回成功文案")
    void updatesConversationTitle() {
        String result = chatService.updateChatConversation(ChatConversationUpdateParam
                .ChatConversationUpdateParamBuilder()
                .conversationId(1L)
                .title("新标题")
                .build(), context);

        assertThat(result).isEqualTo("SUCCESS");
        verify(chatConversationService).updateById(any(ChatConversation.class));
    }

    private void stubStream(FastApiChatCompletionsVO... chunks) {
        doAnswer(invocation -> {
            Consumer<FastApiChatCompletionsVO> consumer = invocation.getArgument(2);
            for (FastApiChatCompletionsVO chunk : chunks) {
                consumer.accept(chunk);
            }
            return null;
        }).when(harnessClient).streamChat(any(), any(), any());
    }

    private ChatCompletionsDTO chatCompletions(String prompt) {
        return ChatCompletionsDTO.builder()
                .prompt(prompt)
                .model("deepseek_deepseek-r1")
                .build();
    }

    private FastApiChatCompletionsVO chunk(String content) {
        FastApiChatCompletionsVO.Choice.Delta delta = new FastApiChatCompletionsVO.Choice.Delta();
        delta.setContent(content);
        FastApiChatCompletionsVO.Choice choice = new FastApiChatCompletionsVO.Choice();
        choice.setIndex(0L);
        choice.setDelta(delta);
        FastApiChatCompletionsVO chunk = new FastApiChatCompletionsVO();
        chunk.setChoices(List.of(choice));
        return chunk;
    }

    private static class StubChatServiceImpl extends ChatServiceImpl {

        private StubSseEmitter emitter;

        @Override
        SseEmitter newSseEmitter() {
            emitter = new StubSseEmitter();
            return emitter;
        }
    }

    private static class StubSseEmitter extends SseEmitter {

        private final List<Object> dataEvents = new ArrayList<>();

        @Override
        public void send(SseEventBuilder builder) {
            builder.build().stream()
                    .map(SseEmitter.DataWithMediaType::getData)
                    .filter(data -> data instanceof ResData)
                    .forEach(dataEvents::add);
        }

        @Override
        public void complete() {
        }

        private List<Object> dataEvents() {
            return dataEvents;
        }
    }
}
