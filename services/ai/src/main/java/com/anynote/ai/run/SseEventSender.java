package com.anynote.ai.run;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 对 {@link SseEmitter} 的发送封装：浏览器断开后不再发送，且不中断上游读取。
 *
 * @author 称霸幼儿园
 */
public class SseEventSender {

    private final SseEmitter emitter;

    private final AtomicBoolean clientGone = new AtomicBoolean(false);

    public SseEventSender(SseEmitter emitter) {
        this.emitter = emitter;
    }

    /**
     * 发送一个 SSE 事件。
     *
     * @param eventName 事件名
     * @param data 事件数据，为 null 时只发送事件名
     * @return 发送成功返回 true；浏览器已断开返回 false
     */
    public boolean send(String eventName, Object data) {
        if (clientGone.get()) {
            return false;
        }
        try {
            SseEmitter.SseEventBuilder builder = SseEmitter.event()
                    .name(eventName)
                    .id(String.valueOf(System.currentTimeMillis()));
            if (data != null) {
                builder.data(data);
            }
            emitter.send(builder);
            return true;
        } catch (IOException | IllegalStateException e) {
            clientGone.set(true);
            return false;
        }
    }

    /**
     * 浏览器连接是否已断开。
     *
     * @return 已断开返回 true
     */
    public boolean isClientGone() {
        return clientGone.get();
    }

    /**
     * 正常结束本次 SSE 响应。
     */
    public void complete() {
        try {
            emitter.complete();
        } catch (IllegalStateException e) {
            clientGone.set(true);
        }
    }
}
