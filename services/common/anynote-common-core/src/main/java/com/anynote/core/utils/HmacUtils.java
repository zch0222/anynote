package com.anynote.core.utils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * HMAC-SHA256 工具类，用于服务间内部调用签名验证
 */
public class HmacUtils {

    private static final String ALGORITHM = "HmacSHA256";

    /** 时间戳有效窗口：5 分钟 */
    private static final long TIMESTAMP_WINDOW_MS = 5 * 60 * 1000L;

    public static String sign(String secret, String payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            return Base64.getEncoder().encodeToString(
                    mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new RuntimeException("HMAC 签名失败", e);
        }
    }

    public static boolean verify(String secret, String timestamp, String signature) {
        if (timestamp == null || signature == null) {
            return false;
        }
        try {
            long ts = Long.parseLong(timestamp);
            if (Math.abs(System.currentTimeMillis() - ts) > TIMESTAMP_WINDOW_MS) {
                return false;
            }
            return sign(secret, timestamp).equals(signature);
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
