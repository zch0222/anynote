package com.anynote.ai.harness;

import com.anynote.ai.harness.dto.FastApiChatCompletionsDTO;
import com.anynote.ai.properties.AiHarnessProperties;
import com.anynote.ai.run.AiCallContext;
import com.anynote.common.security.properties.InternalSecretProperties;
import com.anynote.system.api.model.bo.LoginUser;
import com.google.gson.Gson;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link HarnessClient} 空闲超时单元测试：上游保持连接但不再发送事件时按空闲超时结束。
 *
 * @author 称霸幼儿园
 */
class HarnessClientIdleTimeoutTest {

    @Test
    @DisplayName("上游收到响应后停止发送事件时抛空闲超时异常")
    void failsWhenUpstreamStopsSendingEvents() throws Exception {
        try (ServerSocket serverSocket = new ServerSocket(0)) {
            Thread upstream = new Thread(() -> serveOnceAndStall(serverSocket));
            upstream.setDaemon(true);
            upstream.start();

            AiHarnessProperties properties = new AiHarnessProperties();
            properties.setServiceName("127.0.0.1:" + serverSocket.getLocalPort());
            properties.setConnectTimeout(Duration.ofSeconds(2));
            properties.setIdleTimeout(Duration.ofMillis(300));
            properties.setTotalTimeout(Duration.ofSeconds(10));
            InternalSecretProperties secretProperties = new InternalSecretProperties();
            secretProperties.setSecret("test-internal-secret");
            HarnessClient harnessClient = new HarnessClient(
                    RestClient.builder(), properties, new Gson(), secretProperties);
            LoginUser loginUser = new LoginUser();
            loginUser.setUserId(1L);
            FastApiChatCompletionsDTO request = FastApiChatCompletionsDTO.builder()
                    .model("test-model")
                    .messages(List.of(FastApiChatCompletionsDTO.Message.builder()
                            .role("user")
                            .content("你好")
                            .build()))
                    .build();

            assertThatThrownBy(() -> harnessClient.streamChat(new AiCallContext(loginUser, "token"), request, chunk -> {
            })).isInstanceOf(HarnessClientException.class);
        }
    }

    private void serveOnceAndStall(ServerSocket serverSocket) {
        try (Socket socket = serverSocket.accept()) {
            OutputStream outputStream = socket.getOutputStream();
            outputStream.write(("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n"
                    + "Transfer-Encoding: chunked\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
            Thread.sleep(5000);
        } catch (Exception ignored) {
            // 测试结束关闭 socket
        }
    }
}
