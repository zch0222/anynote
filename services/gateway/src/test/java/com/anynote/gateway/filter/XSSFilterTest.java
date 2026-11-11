package com.anynote.gateway.filter;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import com.anynote.gateway.properties.XssProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * {@link XSSFilter}：只管「什么时候过滤」与「透传/改写怎么选」。
 *
 * 回归的是 UI 走查 E-01：曾经的整包 `EscapeUtil.clean` 会把正文里的 `>` 转义成
 * `&gt;`，引用块保存一次就退化成普通段落。这里从过滤器入口验证 Markdown 文本字段
 * 能原样到达下游，同时不放弃其它字段的转义与各条跳过分支。
 */
@ExtendWith(MockitoExtension.class)
class XSSFilterTest
{
    @Mock
    private GatewayFilterChain chain;

    @InjectMocks
    private XSSFilter filter;

    private XssProperties xss;

    @BeforeEach
    void setUp()
    {
        xss = new XssProperties();
        xss.setEnabled(true);
        // 排除规则匹配的是**完整请求路径**（带 /api 前缀）——
        // nacos 里那条 `/system/notice` 实际上永远匹配不到，这里按真实语义写。
        xss.setExcludeUrls(List.of("/api/system/notice"));
        ReflectionTestUtils.setField(filter, "xss", xss);
    }

    @Test
    void quoteBlockInNoteContentReachesDownstreamUnescaped()
    {
        String body = "{\"title\":\"引用测试\",\"content\":\"# 引用测试\\n\\n> 引用文字\\n\"}";

        String forwarded = forward(jsonPost("/api/note/notes", body));

        assertThat(forwarded).isEqualTo(body);
        assertThat(forwarded).contains("> 引用文字");
        assertThat(forwarded).doesNotContain("&gt;");
    }

    @Test
    void nonTextFieldsAreStillEntityEscaped()
    {
        String body = "{\"content\":\"> 引用\",\"nickname\":\"a<b\"}";

        String forwarded = forward(jsonPost("/api/note/notes", body));

        assertThat(forwarded).contains("\"content\":\"> 引用\"");
        assertThat(forwarded).contains("a&lt;b");
    }

    @Test
    void disabledFilterPassesBodyThrough()
    {
        xss.setEnabled(false);
        String body = "{\"nickname\":\"a<b\"}";

        String forwarded = forward(jsonPost("/api/note/notes", body));

        assertThat(forwarded).isEqualTo(body);
        assertThat(forwarded).contains("a<b");
    }

    @Test
    void getRequestsAreNotFiltered()
    {
        String forwarded = forward(MockServerHttpRequest.get("/api/note/notes").build());

        assertThat(forwarded).isEmpty();
    }

    @Test
    void nonJsonRequestsAreNotFiltered()
    {
        String body = "a<b";
        String forwarded = forward(textPost("/api/note/notes", body));

        assertThat(forwarded).isEqualTo(body);
    }

    @Test
    void excludedUrlsAreNotFiltered()
    {
        String body = "{\"noticeContent\":\"a<b\"}";

        String forwarded = forward(jsonPost("/api/system/notice", body));

        assertThat(forwarded).isEqualTo(body);
    }

    private static MockServerHttpRequest jsonPost(String path, String body)
    {
        return MockServerHttpRequest.post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    private static MockServerHttpRequest textPost(String path, String body)
    {
        return MockServerHttpRequest.post(path)
                .contentType(MediaType.TEXT_PLAIN)
                .body(body);
    }

    /** 跑一遍过滤器，返回真正交给下游的请求体。 */
    private String forward(MockServerHttpRequest request)
    {
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        AtomicReference<String> captured = new AtomicReference<>();
        when(chain.filter(any())).thenAnswer(invocation -> {
            ServerWebExchange forwarded = invocation.getArgument(0);
            DataBuffer joined = DataBufferUtils.join(forwarded.getRequest().getBody()).block();
            if (joined == null)
            {
                captured.set("");
                return Mono.empty();
            }
            byte[] bytes = new byte[joined.readableByteCount()];
            joined.read(bytes);
            DataBufferUtils.release(joined);
            captured.set(new String(bytes, StandardCharsets.UTF_8));
            return Mono.empty();
        });

        StepVerifier.create(filter.filter(exchange, chain)).expectComplete().verify();
        return captured.get();
    }
}
