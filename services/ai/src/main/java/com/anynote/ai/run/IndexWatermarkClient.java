package com.anynote.ai.run;

import com.anynote.ai.model.vo.AgentIndexWatermarkVO;
import com.anynote.ai.properties.AiIndexerProperties;
import com.google.gson.FieldNamingPolicy;
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
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 读取 Worker 已公开的索引水位字段，只保留 {@link AgentIndexWatermarkVO.Fields} 上登记的字段。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Component
public class IndexWatermarkClient {

    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(1);

    private static final String STATUS_UNAVAILABLE = "unavailable";

    private final RestClient restClient;

    private final Gson snakeCaseGson;

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
        this.snakeCaseGson = gson.newBuilder()
                .setFieldNamingPolicy(FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES)
                .create();
    }

    /**
     * 读取索引状态；探针失败时返回不可用状态，不影响运行。
     *
     * @return Worker 状态与水位字段
     */
    public AgentIndexWatermarkVO snapshot() {
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

    private AgentIndexWatermarkVO parseSnapshot(String body) {
        JsonObject root = JsonParser.parseString(body).getAsJsonObject();
        JsonElement status = root.get("status");
        if (status == null || status.isJsonNull() || !status.isJsonPrimitive()) {
            return unavailableSnapshot();
        }
        JsonElement rawWatermark = root.get("watermark");
        AgentIndexWatermarkVO.Fields watermark = rawWatermark != null && rawWatermark.isJsonObject()
                ? snakeCaseGson.fromJson(rawWatermark, AgentIndexWatermarkVO.Fields.class)
                : new AgentIndexWatermarkVO.Fields();
        return AgentIndexWatermarkVO.builder()
                .status(status.getAsString())
                .watermark(watermark)
                .build();
    }

    private AgentIndexWatermarkVO unavailableSnapshot() {
        return AgentIndexWatermarkVO.builder()
                .status(STATUS_UNAVAILABLE)
                .watermark(new AgentIndexWatermarkVO.Fields())
                .build();
    }
}
