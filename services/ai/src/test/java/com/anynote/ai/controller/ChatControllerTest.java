package com.anynote.ai.controller;

import com.anynote.ai.api.enums.ChatRole;
import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.model.vo.AgentProcessViewVO;
import com.anynote.ai.model.vo.ChatConversationDetailVO;
import com.anynote.ai.model.vo.ChatConversationVO;
import com.anynote.ai.run.ProcessViewRecheck;
import com.anynote.ai.service.ChatService;
import com.anynote.core.web.model.bo.ResData;
import com.google.gson.Gson;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * 会话详情图片发送清单的权限复核单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class ChatControllerTest {

    @InjectMocks
    private ChatController controller;

    @Mock
    private ChatService chatService;

    @Mock
    private ProcessViewRecheck processViewRecheck;

    @Spy
    private Gson gson = new Gson();

    /**
     * 可见历史保留图片元数据，隐藏或无法复核的历史同步清空清单。
     */
    @Test
    void clearsVisualDispatchesWhenHistoryIsHiddenOrUnavailable() {
        List<ChatMessage> messages = List.of(message(), message(), message());
        when(chatService.getChatConversationById(org.mockito.ArgumentMatchers.any()))
                .thenReturn(ChatConversationVO.builder().messages(messages).build());
        when(processViewRecheck.recheckAll(messages)).thenReturn(java.util.Arrays.asList(
                AgentProcessViewVO.builder().hidden(false).build(),
                AgentProcessViewVO.builder().hidden(true).build(),
                null));

        ResData<ChatConversationDetailVO> response = controller.getChatConversationById(42L);

        List<com.anynote.ai.model.vo.ChatMessageVO> result = response.getData().getMessages();
        assertThat(result.get(0).getVisualDispatches()).hasSize(1);
        assertThat(result.get(1).getVisualDispatches()).isEmpty();
        assertThat(result.get(2).getVisualDispatches()).isEmpty();
    }

    private ChatMessage message() {
        return ChatMessage.builder()
                .content("答案")
                .role(ChatRole.ASSISTANT.getValue())
                .visualDispatches("[{\"dispatchId\":\"visual-dispatch-01\",\"images\":[]}]")
                .build();
    }
}
