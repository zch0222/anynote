package com.anynote.ai.harness;

/**
 * Harness 调用异常。
 *
 * @author 称霸幼儿园
 */
public class HarnessClientException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final boolean retryable;

    public HarnessClientException(String message) {
        this(message, false);
    }

    public HarnessClientException(String message, boolean retryable) {
        super(message);
        this.retryable = retryable;
    }

    public HarnessClientException(String message, Throwable cause, boolean retryable) {
        super(message, cause);
        this.retryable = retryable;
    }

    /**
     * 该异常是否允许在尚未收到任何事件时重试一次。
     *
     * @return 可重试返回 true
     */
    public boolean isRetryable() {
        return retryable;
    }
}
