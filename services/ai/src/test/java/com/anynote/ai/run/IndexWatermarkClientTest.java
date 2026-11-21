package com.anynote.ai.run;

import com.anynote.ai.model.vo.AgentIndexWatermarkVO;
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
     * 只保留水位类上登记的字段，Worker 的蛇形字段名转换为对应属性。
     */
    @Test
    void returnsOnlyApprovedWatermarkFields() {
        server.expect(requestTo("http://anynote-ai-indexer/healthz"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"status":"ok","watermark":{"processed_cursor":41,"lag_records":2,
                        "chunker_version":"v1","private_field":"hidden"}}
                        """, MediaType.APPLICATION_JSON));

        AgentIndexWatermarkVO snapshot = client.snapshot();

        assertThat(snapshot.getStatus()).isEqualTo("ok");
        assertThat(snapshot.getWatermark().getProcessedCursor()).isEqualTo(41L);
        assertThat(snapshot.getWatermark().getLagRecords()).isEqualTo(2L);
        assertThat(snapshot.getWatermark().getChunkerVersion()).isEqualTo("v1");
        assertThat(snapshot.getWatermark().getLatestCursor()).isNull();
        server.verify();
    }

    /**
     * Worker 不可达时返回 unavailable 且不抛出探针异常。
     */
    @Test
    void returnsUnavailableWhenWorkerCannotBeReached() {
        server.expect(requestTo("http://anynote-ai-indexer/healthz"))
                .andRespond(withException(new IOException("connection failed")));

        AgentIndexWatermarkVO snapshot = client.snapshot();

        assertThat(snapshot.getStatus()).isEqualTo("unavailable");
        assertThat(snapshot.getWatermark()).isEqualTo(new AgentIndexWatermarkVO.Fields());
        server.verify();
    }
}
