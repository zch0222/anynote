package com.anynote.ai.run;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link SseEventSender} 单元测试：浏览器断开后停止发送。
 *
 * @author 称霸幼儿园
 */
class SseEventSenderTest {

    @Test
    @DisplayName("正常发送并结束响应")
    void sendsAndCompletes() {
        StubSseEmitter emitter = new StubSseEmitter();
        SseEventSender sender = new SseEventSender(emitter);

        assertThat(sender.send("message", "hello")).isTrue();
        assertThat(sender.send("heartbeat", null)).isTrue();
        sender.complete();

        assertThat(emitter.sendCount).isEqualTo(2);
        assertThat(emitter.completeCount).isEqualTo(1);
        assertThat(sender.isClientGone()).isFalse();
    }

    @Test
    @DisplayName("发送失败后标记断开并跳过后续发送")
    void stopsSendingAfterClientGone() {
        StubSseEmitter emitter = new StubSseEmitter();
        emitter.failNext = true;
        SseEventSender sender = new SseEventSender(emitter);

        assertThat(sender.send("message", "first")).isFalse();
        assertThat(sender.isClientGone()).isTrue();
        assertThat(sender.send("message", "second")).isFalse();

        assertThat(emitter.sendCount).isZero();
    }

    private static class StubSseEmitter extends SseEmitter {

        private final List<Object> sent = new ArrayList<>();

        private int sendCount;

        private int completeCount;

        private boolean failNext;

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            if (failNext) {
                throw new IOException("client gone");
            }
            sent.add(builder.build());
            sendCount++;
        }

        @Override
        public void complete() {
            completeCount++;
        }
    }
}
