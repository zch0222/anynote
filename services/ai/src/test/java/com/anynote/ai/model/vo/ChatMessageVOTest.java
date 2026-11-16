package com.anynote.ai.model.vo;

import com.anynote.ai.api.model.po.ChatMessage;
import com.google.gson.Gson;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 会话消息结构化引用与回答标注转换单元测试。
 *
 * @author 称霸幼儿园
 */
class ChatMessageVOTest {

    /**
     * JSON 引用与回答标注转换为接口数组，同时保留运行标识与结果类型。
     */
    @Test
    void convertsPersistedCitationsToStructuredArray() {
        ChatMessage message = ChatMessage.builder()
                .id(1L)
                .content("答案")
                .runId("run-1")
                .citations("[{\"index\":1,\"evidenceId\":\"E1\"}]")
                .answerNotices("[\"UNSOURCED\"]")
                .outcome("ANSWERED")
                .build();

        ChatMessageVO result = ChatMessageVO.from(message, new Gson());

        assertThat(result.getRunId()).isEqualTo("run-1");
        assertThat(result.getOutcome()).isEqualTo("ANSWERED");
        assertThat(result.getAnswerNotices()).containsExactly("UNSOURCED");
        Map<String, Object> citation = result.getCitations().get(0);
        assertThat(citation).containsEntry("index", 1.0)
                .containsEntry("evidenceId", "E1");
    }
}
