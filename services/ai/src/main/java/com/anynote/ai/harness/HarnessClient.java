package com.anynote.ai.harness;

import com.anynote.ai.harness.dto.FastApiChatCompletionsDTO;
import com.anynote.ai.harness.dto.FastApiWhisperTranscriptionDTO;
import com.anynote.ai.harness.vo.FastApiChatCompletionsVO;
import com.anynote.ai.harness.vo.FastApiWhisperTranscriptionVO;
import com.anynote.ai.properties.AiHarnessProperties;
import com.anynote.ai.run.AiCallContext;
import com.anynote.common.security.properties.InternalSecretProperties;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.utils.HmacUtils;
import com.anynote.core.utils.StringUtils;
import com.google.gson.Gson;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/**
 * 访问 Python Harness 服务的同步流式客户端：按 Nacos 服务名负载均衡，读取上游 SSE 并逐事件回调。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Component
public class HarnessClient {

    private static final String CHAT_PATH = "/v1/chat/completions";

    private static final String TRANSCRIPTION_PATH = "/v1/audio/transcriptions";

    private final RestClient.Builder loadBalancedRestClientBuilder;

    private final AiHarnessProperties aiHarnessProperties;

    private final Gson gson;

    private final InternalSecretProperties internalSecretProperties;

    private final HttpClient httpClient;

    private final ExecutorService httpClientExecutor;

    private final ScheduledExecutorService idleWatchdog;

    public HarnessClient(@LoadBalanced RestClient.Builder loadBalancedRestClientBuilder,
                         AiHarnessProperties aiHarnessProperties,
                         Gson gson,
                         InternalSecretProperties internalSecretProperties) {
        this.loadBalancedRestClientBuilder = loadBalancedRestClientBuilder;
        this.aiHarnessProperties = aiHarnessProperties;
        this.gson = gson;
        this.internalSecretProperties = internalSecretProperties;
        this.httpClientExecutor = Executors.newVirtualThreadPerTaskExecutor();
        this.idleWatchdog = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "harness-idle-watchdog");
            thread.setDaemon(true);
            return thread;
        });
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(aiHarnessProperties.getConnectTimeout())
                .executor(httpClientExecutor)
                .build();
    }

    @PreDestroy
    public void shutdownExecutors() {
        httpClientExecutor.shutdown();
        idleWatchdog.shutdownNow();
    }

    /**
     * 流式调用 Python 对话端点，每收到一个增量回调一次。
     *
     * @param context 调用身份上下文
     * @param request 对话请求
     * @param consumer 增量回调
     */
    public void streamChat(AiCallContext context, FastApiChatCompletionsDTO request,
                           Consumer<FastApiChatCompletionsVO> consumer) {
        streamWithRetry(CHAT_PATH, request, context, data -> consumer.accept(
                gson.fromJson(data, FastApiChatCompletionsVO.class)));
    }

    /**
     * 流式调用 Python 音频转写端点，每收到一个状态事件回调一次。
     *
     * @param context 调用身份上下文
     * @param request 转写请求
     * @param consumer 状态回调
     */
    public void streamTranscription(AiCallContext context, FastApiWhisperTranscriptionDTO request,
                                    Consumer<FastApiWhisperTranscriptionVO> consumer) {
        streamWithRetry(TRANSCRIPTION_PATH, request, context, data -> consumer.accept(
                gson.fromJson(data, FastApiWhisperTranscriptionVO.class)));
    }

    private void streamWithRetry(String path, Object request, AiCallContext context, Consumer<String> dataConsumer) {
        AtomicBoolean receivedEvent = new AtomicBoolean(false);
        Consumer<String> markReceived = data -> {
            receivedEvent.set(true);
            dataConsumer.accept(data);
        };
        try {
            streamOnce(path, request, context, markReceived);
        } catch (HarnessClientException e) {
            if (!e.isRetryable() || receivedEvent.get()) {
                throw e;
            }
            log.warn("Harness 首次事件前调用失败，重试一次: {}", e.getMessage());
            try {
                streamOnce(path, request, context, markReceived);
            } catch (HarnessClientException retryError) {
                throw new HarnessClientException("AI 服务调用失败", retryError, false);
            }
        }
    }

    private void streamOnce(String path, Object request, AiCallContext context, Consumer<String> dataConsumer) {
        long deadlineNanos = System.nanoTime() + aiHarnessProperties.getTotalTimeout().toNanos();
        RestClient.Builder clientBuilder = loadBalancedRestClientBuilder.clone()
                .baseUrl("http://" + aiHarnessProperties.getServiceName());
        ClientHttpRequestFactory requestFactory = buildRequestFactory();
        if (requestFactory != null) {
            clientBuilder.requestFactory(requestFactory);
        }
        RestClient restClient = clientBuilder.build();
        AtomicLong lastActivityNanos = new AtomicLong(System.nanoTime());
        AtomicReference<InputStream> bodyRef = new AtomicReference<>();
        AtomicBoolean idleTimedOut = new AtomicBoolean(false);
        long idleTimeoutNanos = aiHarnessProperties.getIdleTimeout().toNanos();
        long checkIntervalMillis = Math.max(50L, aiHarnessProperties.getIdleTimeout().toMillis() / 2);
        ScheduledFuture<?> watchdog = idleWatchdog.scheduleWithFixedDelay(() -> {
            if (System.nanoTime() - lastActivityNanos.get() > idleTimeoutNanos) {
                idleTimedOut.set(true);
                InputStream body = bodyRef.get();
                if (body != null) {
                    try {
                        body.close();
                    } catch (IOException ignored) {
                        // 由读线程按超时处理
                    }
                }
            }
        }, checkIntervalMillis, checkIntervalMillis, TimeUnit.MILLISECONDS);
        try {
            restClient.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.TEXT_EVENT_STREAM)
                    .headers(headers -> applyHeaders(headers, context))
                    .body(request)
                    .exchange((clientRequest, clientResponse) -> {
                        if (!clientResponse.getStatusCode().is2xxSuccessful()) {
                            throw new HarnessClientException(
                                    "AI 服务返回状态码 " + clientResponse.getStatusCode().value());
                        }
                        InputStream body = clientResponse.getBody();
                        bodyRef.set(body);
                        readSse(body, deadlineNanos, lastActivityNanos, idleTimedOut, dataConsumer);
                        return null;
                    });
        } catch (HarnessClientException e) {
            if (idleTimedOut.get()) {
                throw new HarnessClientException("AI 服务响应空闲超时", e, true);
            }
            throw e;
        } catch (Exception e) {
            if (idleTimedOut.get()) {
                throw new HarnessClientException("AI 服务响应空闲超时", e, true);
            }
            throw new HarnessClientException("AI 服务调用失败", e, true);
        } finally {
            watchdog.cancel(false);
        }
    }

    private void applyHeaders(org.springframework.http.HttpHeaders headers, AiCallContext context) {
        String timestamp = String.valueOf(System.currentTimeMillis());
        headers.set(SecurityConstants.FROM_SOURCE, SecurityConstants.INNER);
        headers.set(SecurityConstants.INTERNAL_TIMESTAMP, timestamp);
        headers.set(SecurityConstants.INTERNAL_SIGN,
                HmacUtils.sign(internalSecretProperties.resolveSecret(), timestamp));
        if (context != null && StringUtils.isNotEmpty(context.getAccessToken())) {
            headers.set(SecurityConstants.ACCESS_TOKEN, context.getAccessToken());
        }
    }

    protected org.springframework.http.client.ClientHttpRequestFactory buildRequestFactory() {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(aiHarnessProperties.getIdleTimeout());
        return requestFactory;
    }

    private void readSse(InputStream inputStream, long deadlineNanos, AtomicLong lastActivityNanos,
                         AtomicBoolean idleTimedOut, Consumer<String> dataConsumer) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            StringBuilder data = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                lastActivityNanos.set(System.nanoTime());
                if (idleTimedOut.get()) {
                    throw new HarnessClientException("AI 服务响应空闲超时", false);
                }
                if (System.nanoTime() > deadlineNanos) {
                    throw new HarnessClientException("AI 服务响应超时", false);
                }
                if (line.isEmpty()) {
                    dispatch(data, dataConsumer);
                    data.setLength(0);
                    continue;
                }
                if (line.startsWith(":")) {
                    continue;
                }
                if (line.startsWith("data:")) {
                    String value = line.substring("data:".length());
                    if (value.startsWith(" ")) {
                        value = value.substring(1);
                    }
                    if (data.length() > 0) {
                        data.append('\n');
                    }
                    data.append(value);
                }
            }
            if (idleTimedOut.get()) {
                throw new HarnessClientException("AI 服务响应空闲超时", false);
            }
            dispatch(data, dataConsumer);
        } catch (IOException e) {
            if (idleTimedOut.get()) {
                throw new HarnessClientException("AI 服务响应空闲超时", e, true);
            }
            throw new HarnessClientException("读取 AI 服务响应失败", e, true);
        }
    }

    private void dispatch(StringBuilder data, Consumer<String> dataConsumer) {
        if (data.length() == 0) {
            return;
        }
        String payload = data.toString();
        try {
            dataConsumer.accept(payload);
        } catch (RuntimeException e) {
            throw new HarnessClientException("解析 AI 服务响应失败", e, false);
        }
    }
}
