package com.anynote.ai.model.vo;

import com.anynote.ai.api.model.po.ChatMessage;
import com.google.gson.Gson;
import org.junit.jupiter.api.Test;

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
                .citations("[{\"index\":1,\"evidenceId\":\"E1\",\"locator\":{\"heading\":\"2.1\",\"_key\":\"x\"}}]")
                .answerNotices("[\"UNSOURCED\"]")
                .outcome("ANSWERED")
                .build();

        ChatMessageVO result = ChatMessageVO.from(message, new Gson());

        assertThat(result.getRunId()).isEqualTo("run-1");
        assertThat(result.getOutcome()).isEqualTo("ANSWERED");
        assertThat(result.getAnswerNotices()).containsExactly("UNSOURCED");
        AgentCitationVO citation = result.getCitations().get(0);
        assertThat(citation.getIndex()).isEqualTo(1);
        assertThat(citation.getEvidenceId()).isEqualTo("E1");
        assertThat(citation.getLocator().getHeading()).isEqualTo("2.1");
    }

    /**
     * 持久化图片清单转换为强类型元数据，接口不包含图片字节。
     */
    @Test
    void convertsVisualDispatchesWithoutImageBytes() {
        ChatMessage message = ChatMessage.builder()
                .content("答案")
                .visualDispatches("[{\"dispatchId\":\"visual-dispatch-01\",\"runId\":\"run-1\","
                        + "\"modelTurn\":2,\"logicalModel\":\"agent_main\",\"providerKey\":\"p\","
                        + "\"model\":\"vision\",\"images\":[{\"attachmentId\":\"visual:01\","
                        + "\"ref\":\"doc:77\",\"title\":\"设计稿\",\"pageNo\":3,\"evidenceId\":\"E4\","
                        + "\"contentVersion\":\"v7\",\"sourceTool\":\"kb_view_doc\","
                        + "\"sourceCallId\":\"c1\",\"mediaType\":\"image/jpeg\",\"width\":20,"
                        + "\"height\":10,\"sizeBytes\":7,\"sha256\":\"abc\",\"estimatedTokens\":2000}]}]")
                .build();

        ChatMessageVO result = ChatMessageVO.from(message, new Gson());

        assertThat(result.getVisualDispatches()).hasSize(1);
        AgentVisualDispatchVO dispatch = result.getVisualDispatches().get(0);
        assertThat(dispatch.getDispatchId()).isEqualTo("visual-dispatch-01");
        assertThat(dispatch.getImages().get(0).getRef()).isEqualTo("doc:77");
        assertThat(dispatch.getImages().get(0).getPageNo()).isEqualTo(3);
        assertThat(new Gson().toJson(result)).doesNotContain("data:image", "imageBytes");
    }

    /**
     * 落库的过程视图不经转换直接下发，必须经读取复核后另行设置。
     */
    @Test
    void doesNotPassThroughPersistedProcessView() {
        ChatMessage message = ChatMessage.builder()
                .id(2L)
                .content("答案")
                .build();
        message.setProcess("{\"version\":1,\"items\":[],\"dependencies\":[\"note:1\"]}");

        assertThat(ChatMessageVO.from(message, new Gson()).getProcess()).isNull();
    }
}
