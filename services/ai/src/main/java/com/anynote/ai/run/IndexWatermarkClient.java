package com.anynote.ai.run;

import com.anynote.ai.properties.AiIndexerProperties;
import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PreDestroy;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 读取 Worker 已公开的索引水位白名单字段。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Component
public class IndexWatermarkClient {

    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(1);

    private static final Map<String, String> WATERMARK_FIELDS = Map.of(
            "processed_cursor", "processedCursor",
            "latest_cursor", "latestCursor",
            "lag_records", "lagRecords",
            "last_processed_at", "lastProcessedAt",
            "last_success_at", "lastSuccessAt",
            "last_error_type", "lastErrorType",
            "chunker_version", "chunkerVersion",
            "embedding_profile_version", "embeddingProfileVersion");

    private final RestClient restClient;

    private final Gson gson;

    private final ExecutorService probeExecutor = Executors.newVirtualThreadPerTaskExecutor();

    /**
     * 构造负载均衡的 Worker 探针客户端。
     *
     * @param builder 负载均衡 RestClient 构造器
     * @param properties Worker 调用配置
     * @param gson JSON 序列化器
     */
    public IndexWatermarkClient(@LoadBalanced RestClient.Builder builder,
                                AiIndexerProperties properties,
                                Gson gson) {
        this.restClient = builder.clone()
                .baseUrl("http://" + properties.getServiceName())
                .build();
        this.gson = gson;
    }

    /**
     * 读取索引状态；探针失败时返回不可用状态，不影响运行。
     *
     * @return Worker 状态与白名单水位字段
     */
    public Map<String, Object> snapshot() {
        Future<String> response = probeExecutor.submit(this::readHealthResponse);
        try {
            return parseSnapshot(response.get(PROBE_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS));
        } catch (TimeoutException error) {
            response.cancel(true);
            log.debug("索引水位探测超时");
            return unavailableSnapshot();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            response.cancel(true);
            return unavailableSnapshot();
        } catch (ExecutionException error) {
            Throwable cause = error.getCause();
            log.debug("索引水位探测不可用: {}",
                    cause == null ? error.getClass().getSimpleName() : cause.getClass().getSimpleName());
            return unavailableSnapshot();
        } catch (Exception error) {
            log.debug("索引水位探测不可用: {}", error.getClass().getSimpleName());
            return unavailableSnapshot();
        }
    }

    /**
     * 停止 Worker 探针执行器。
     */
    @PreDestroy
    public void shutdown() {
        probeExecutor.shutdownNow();
    }

    private String readHealthResponse() {
        return restClient.get()
                .uri("/healthz")
                .exchange((request, response) -> StreamUtils.copyToString(
                        response.getBody(), StandardCharsets.UTF_8));
    }

    private Map<String, Object> parseSnapshot(String body) {
        JsonObject root = JsonParser.parseString(body).getAsJsonObject();
        JsonElement status = root.get("status");
        if (status == null || status.isJsonNull() || !status.isJsonPrimitive()) {
            return unavailableSnapshot();
        }
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("status", status.getAsString());
        Map<String, Object> watermark = new LinkedHashMap<>();
        JsonElement rawWatermark = root.get("watermark");
        if (rawWatermark != null && rawWatermark.isJsonObject()) {
            JsonObject fields = rawWatermark.getAsJsonObject();
            WATERMARK_FIELDS.forEach((source, target) -> {
                JsonElement value = fields.get(source);
                if (value != null) {
                    watermark.put(target, gson.fromJson(value, Object.class));
                }
            });
        }
        snapshot.put("watermark", watermark);
        return snapshot;
    }

    private Map<String, Object> unavailableSnapshot() {
        return Map.of("status", "unavailable", "watermark", Map.of());
    }
}
