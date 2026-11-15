package com.anynote.ai.run;

import com.anynote.ai.properties.AiIndexerProperties;
import com.google.gson.Gson;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Worker 水位探测的白名单与降级单元测试。
 *
 * @author 称霸幼儿园
 */
class IndexWatermarkClientTest {

    private MockRestServiceServer server;

    private IndexWatermarkClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new IndexWatermarkClient(builder, new AiIndexerProperties(), new Gson());
    }

    @AfterEach
    void tearDown() {
        client.shutdown();
    }

    /**
     * 只返回 Worker 明确公开的水位字段并转换为 camelCase。
     */
    @Test
    void returnsOnlyApprovedWatermarkFields() {
        server.expect(requestTo("http://anynote-ai-indexer/healthz"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"status":"ok","watermark":{"processed_cursor":"c1","lag_records":2,
                        "private_field":"hidden"}}
                        """, MediaType.APPLICATION_JSON));

        Map<String, Object> snapshot = client.snapshot();

        assertThat(snapshot).containsEntry("status", "ok");
        Map<?, ?> watermark = (Map<?, ?>) snapshot.get("watermark");
        assertThat(watermark.get("processedCursor")).isEqualTo("c1");
        assertThat(watermark.get("lagRecords")).isEqualTo(2.0);
        assertThat(watermark.containsKey("private_field")).isFalse();
        server.verify();
    }

    /**
     * Worker 不可达时返回 unavailable 且不抛出探针异常。
     */
    @Test
    void returnsUnavailableWhenWorkerCannotBeReached() {
        server.expect(requestTo("http://anynote-ai-indexer/healthz"))
                .andRespond(withException(new IOException("connection failed")));

        Map<String, Object> snapshot = client.snapshot();

        assertThat(snapshot).containsEntry("status", "unavailable");
        assertThat(snapshot.get("watermark")).isEqualTo(Map.of());
        server.verify();
    }
}
