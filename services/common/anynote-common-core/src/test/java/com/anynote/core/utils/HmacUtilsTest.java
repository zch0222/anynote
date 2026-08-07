package com.anynote.core.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link HmacUtils} 单元测试。
 *
 * <p>这是服务间内部调用（{@code @InnerAuth}）的鉴权地基：签名一旦失效，
 * 要么所有 Feign 调用全挂，要么内部端点对外裸奔。重点覆盖时间窗口边界与
 * 各类伪造场景。
 */
class HmacUtilsTest {

    private static final String SECRET = "internal-shared-secret";
    private static final long WINDOW_MS = 5 * 60 * 1000L;

    private static String now() {
        return String.valueOf(System.currentTimeMillis());
    }

    @Test
    @DisplayName("sign：同样的 secret + payload 结果稳定（否则验签必然失败）")
    void signIsDeterministic() {
        String first = HmacUtils.sign(SECRET, "1700000000000");
        String second = HmacUtils.sign(SECRET, "1700000000000");

        assertThat(first).isEqualTo(second);
        assertThat(first).isNotBlank();
    }

    @Test
    @DisplayName("sign：secret 或 payload 任一不同，签名就不同")
    void signDiffersOnDifferentInput() {
        String base = HmacUtils.sign(SECRET, "1700000000000");

        assertThat(HmacUtils.sign("other-secret", "1700000000000")).isNotEqualTo(base);
        assertThat(HmacUtils.sign(SECRET, "1700000000001")).isNotEqualTo(base);
    }

    @Test
    @DisplayName("sign：输出是 Base64，可安全放进 HTTP header")
    void signOutputIsBase64() {
        String signature = HmacUtils.sign(SECRET, now());

        assertThat(signature).matches("^[A-Za-z0-9+/]+={0,2}$");
    }

    @Test
    @DisplayName("verify：当前时间戳 + 正确签名通过")
    void verifyAcceptsFreshSignature() {
        String timestamp = now();
        String signature = HmacUtils.sign(SECRET, timestamp);

        assertThat(HmacUtils.verify(SECRET, timestamp, signature)).isTrue();
    }

    @Test
    @DisplayName("verify：secret 不匹配时拒绝（防止拿到时间戳就能伪造）")
    void verifyRejectsWrongSecret() {
        String timestamp = now();
        String signature = HmacUtils.sign("attacker-secret", timestamp);

        assertThat(HmacUtils.verify(SECRET, timestamp, signature)).isFalse();
    }

    @Test
    @DisplayName("verify：签名被篡改时拒绝")
    void verifyRejectsTamperedSignature() {
        String timestamp = now();

        assertThat(HmacUtils.verify(SECRET, timestamp, "not-the-signature")).isFalse();
        assertThat(HmacUtils.verify(SECRET, timestamp, "")).isFalse();
    }

    @Test
    @DisplayName("verify：签名对但时间戳被换掉时拒绝（签名与时间戳绑定）")
    void verifyRejectsMismatchedTimestamp() {
        String signedAt = now();
        String signature = HmacUtils.sign(SECRET, signedAt);
        String otherTimestamp = String.valueOf(Long.parseLong(signedAt) + 1);

        assertThat(HmacUtils.verify(SECRET, otherTimestamp, signature)).isFalse();
    }

    @Test
    @DisplayName("verify：超过 5 分钟窗口的旧请求拒绝（防重放）")
    void verifyRejectsExpiredTimestamp() {
        String stale = String.valueOf(System.currentTimeMillis() - WINDOW_MS - 10_000);
        String signature = HmacUtils.sign(SECRET, stale);

        assertThat(HmacUtils.verify(SECRET, stale, signature)).isFalse();
    }

    @Test
    @DisplayName("verify：超前 5 分钟的未来时间戳同样拒绝（窗口是双向的）")
    void verifyRejectsFarFutureTimestamp() {
        String future = String.valueOf(System.currentTimeMillis() + WINDOW_MS + 10_000);
        String signature = HmacUtils.sign(SECRET, future);

        assertThat(HmacUtils.verify(SECRET, future, signature)).isFalse();
    }

    @Test
    @DisplayName("verify：窗口内的轻微时钟偏移仍然接受")
    void verifyAcceptsSmallClockSkew() {
        String slightlyOld = String.valueOf(System.currentTimeMillis() - 60_000);
        String slightlyAhead = String.valueOf(System.currentTimeMillis() + 60_000);

        assertThat(HmacUtils.verify(SECRET, slightlyOld, HmacUtils.sign(SECRET, slightlyOld))).isTrue();
        assertThat(HmacUtils.verify(SECRET, slightlyAhead, HmacUtils.sign(SECRET, slightlyAhead))).isTrue();
    }

    @ParameterizedTest(name = "verify 的 timestamp = [{0}] 时返回 false")
    @NullSource
    @ValueSource(strings = {"", "not-a-number", "12.5", " 1700000000000 "})
    @DisplayName("verify：时间戳缺失或非法时安全失败，不抛异常")
    void verifyRejectsMalformedTimestamp(String timestamp) {
        assertThat(HmacUtils.verify(SECRET, timestamp, "any-signature")).isFalse();
    }

    @Test
    @DisplayName("verify：signature 为 null 时安全失败")
    void verifyRejectsNullSignature() {
        assertThat(HmacUtils.verify(SECRET, now(), null)).isFalse();
    }
}
