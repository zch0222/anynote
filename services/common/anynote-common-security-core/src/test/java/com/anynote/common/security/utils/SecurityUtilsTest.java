package com.anynote.common.security.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link SecurityUtils} 单元测试。BCrypt 是登录链路的地基，
 * 这里锁死"加盐、可验证、不可逆"三条性质，防止有人误改成明文或固定盐。
 */
class SecurityUtilsTest {

    @ParameterizedTest(name = "密码 [{0}] 加密后能被验回")
    @ValueSource(strings = {"123456", "correct-horse-battery-staple", "中文密码", "a", "!@#$%^&*()_+"})
    @DisplayName("encryptPassword / matchesPassword round-trip")
    void encryptedPasswordMatchesOriginal(String raw) {
        String encoded = SecurityUtils.encryptPassword(raw);

        assertThat(SecurityUtils.matchesPassword(raw, encoded)).isTrue();
    }

    @Test
    @DisplayName("密文与明文不同，且是 BCrypt 格式")
    void encodedPasswordIsNotPlainText() {
        String encoded = SecurityUtils.encryptPassword("123456");

        assertThat(encoded).isNotEqualTo("123456");
        assertThat(encoded).startsWith("$2a$");
    }

    @Test
    @DisplayName("同一密码两次加密结果不同（每次随机盐），但都能验回")
    void samePasswordProducesDifferentHashes() {
        String first = SecurityUtils.encryptPassword("123456");
        String second = SecurityUtils.encryptPassword("123456");

        assertThat(first).isNotEqualTo(second);
        assertThat(SecurityUtils.matchesPassword("123456", first)).isTrue();
        assertThat(SecurityUtils.matchesPassword("123456", second)).isTrue();
    }

    @Test
    @DisplayName("错误密码验不过")
    void wrongPasswordDoesNotMatch() {
        String encoded = SecurityUtils.encryptPassword("123456");

        assertThat(SecurityUtils.matchesPassword("1234567", encoded)).isFalse();
        assertThat(SecurityUtils.matchesPassword("", encoded)).isFalse();
        assertThat(SecurityUtils.matchesPassword("123455", encoded)).isFalse();
    }

    @Test
    @DisplayName("密码大小写敏感")
    void matchingIsCaseSensitive() {
        String encoded = SecurityUtils.encryptPassword("Password");

        assertThat(SecurityUtils.matchesPassword("password", encoded)).isFalse();
        assertThat(SecurityUtils.matchesPassword("Password", encoded)).isTrue();
    }
}
