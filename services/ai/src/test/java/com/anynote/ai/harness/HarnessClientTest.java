package com.anynote.ai.harness;

import com.anynote.ai.harness.dto.FastApiChatCompletionsDTO;
import com.anynote.ai.harness.dto.FastApiWhisperTranscriptionDTO;
import com.anynote.ai.harness.vo.FastApiChatCompletionsVO;
import com.anynote.ai.harness.vo.FastApiWhisperTranscriptionVO;
import com.anynote.ai.properties.AiHarnessProperties;
import com.anynote.ai.properties.AiWhisperProperties;
import com.anynote.ai.run.AiCallContext;
import com.anynote.common.security.properties.InternalSecretProperties;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.system.api.model.bo.LoginUser;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * {@link HarnessClient} 单元测试：SSE 解析、内部签名头与首次事件前重试。
 *
 * @author 称霸幼儿园
 */
class HarnessClientTest {

    private static final String CHAT_URL = "http://anynote-ai-harness/v1/chat/completions";

    private MockRestServiceServer server;

    private HarnessClient harnessClient;

    private AiCallContext callContext;

    private AiWhisperProperties whisperProperties;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        AiHarnessProperties properties = new AiHarnessProperties();
        properties.setServiceName("anynote-ai-harness");
        InternalSecretProperties secretProperties = new InternalSecretProperties();
        secretProperties.setSecret("test-internal-secret");
        whisperProperties = new AiWhisperProperties();
        harnessClient = new HarnessClient(builder, properties, whisperProperties, new Gson(), secretProperties) {
            @Override
            protected org.springframework.http.client.ClientHttpRequestFactory buildRequestFactory() {
                return null;
            }
        };
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(9L);
        callContext = new AiCallContext(loginUser, "user-access-token");
    }

    @Test
    @DisplayName("解析上游 SSE 增量并带内部签名与用户令牌头")
    void parsesSseChunksAndSendsInternalHeaders() {
        String sse = "id: 1\nevent: message\ndata: {\"id\":1,\"created\":2,\"model\":\"m\","
                + "\"choices\":[{\"index\":0,\"delta\":{\"content\":\"你好\"}}]}\n\n"
                + "data: {\"id\":2,\"created\":3,\"model\":\"m\","
                + "\"choices\":[{\"index\":0,\"delta\":{\"content\":\"世界\"}}]}\n\n";
        server.expect(requestTo(CHAT_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(SecurityConstants.FROM_SOURCE, SecurityConstants.INNER))
                .andExpect(header(SecurityConstants.ACCESS_TOKEN, "user-access-token"))
                .andRespond(withSuccess(sse, MediaType.TEXT_EVENT_STREAM));
        List<FastApiChatCompletionsVO> chunks = new ArrayList<>();

        harnessClient.streamChat(callContext, chatRequest(), chunks::add);

        server.verify();
        assertThat(chunks).hasSize(2);
        assertThat(chunks.get(0).getChoices().get(0).getDelta().getContent()).isEqualTo("你好");
        assertThat(chunks.get(1).getChoices().get(0).getDelta().getContent()).isEqualTo("世界");
    }

    @Test
    @DisplayName("首次事件前 I/O 失败重试一次后成功")
    void retriesOnceBeforeFirstEvent() {
        server.expect(requestTo(CHAT_URL))
                .andRespond(withException(new IOException("connect failed")));
        server.expect(requestTo(CHAT_URL))
                .andRespond(withSuccess("data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"}}]}\n\n",
                        MediaType.TEXT_EVENT_STREAM));
        List<FastApiChatCompletionsVO> chunks = new ArrayList<>();

        harnessClient.streamChat(callContext, chatRequest(), chunks::add);

        server.verify();
        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0).getChoices().get(0).getDelta().getContent()).isEqualTo("ok");
    }

    @Test
    @DisplayName("上游返回非 2xx 时抛异常且不重试")
    void failsWithoutRetryOnNon2xx() {
        server.expect(requestTo(CHAT_URL)).andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        assertThatThrownBy(() -> harnessClient.streamChat(callContext, chatRequest(), chunk -> {
        })).isInstanceOf(HarnessClientException.class);

        server.verify();
    }

    @Test
    @DisplayName("Whisper 使用独立 Nacos 服务名")
    void whisperUsesIndependentServiceName() {
        whisperProperties.setServiceName("anynote-ai-whisper");
        server.expect(requestTo("http://anynote-ai-whisper/v1/audio/transcriptions"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(SecurityConstants.FROM_SOURCE, SecurityConstants.INNER))
                .andRespond(withSuccess(
                        "data: {\"id\":\"t1\",\"status\":\"DONE\",\"result\":{\"text\":\"你好\"}}\n\n",
                        MediaType.TEXT_EVENT_STREAM));
        List<FastApiWhisperTranscriptionVO> events = new ArrayList<>();

        harnessClient.streamTranscription(callContext, FastApiWhisperTranscriptionDTO.builder()
                .fileUrl("https://example.com/audio.mp3")
                .model("turbo")
                .language("zh")
                .build(), events::add);

        server.verify();
        assertThat(events).hasSize(1);
        assertThat(events.get(0).getStatus()).isEqualTo("DONE");
    }

    private FastApiChatCompletionsDTO chatRequest() {
        return FastApiChatCompletionsDTO.builder()
                .model("deepseek_deepseek-r1")
                .messages(List.of(FastApiChatCompletionsDTO.Message.builder()
                        .role("user")
                        .content("你好")
                        .build()))
                .build();
    }
}
