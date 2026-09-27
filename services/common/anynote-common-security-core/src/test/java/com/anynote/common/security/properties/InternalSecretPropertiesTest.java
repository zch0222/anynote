package com.anynote.common.security.properties;

import com.anynote.core.constant.SecurityConstants;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link InternalSecretProperties} 单元测试：配置值生效、未配置时回落与告警判定。
 *
 * @author 称霸幼儿园
 */
class InternalSecretPropertiesTest {

    @Test
    @DisplayName("配置了密钥时使用配置值（去掉首尾空白）")
    void usesConfiguredSecret() {
        InternalSecretProperties properties = new InternalSecretProperties();
        properties.setSecret("  configured-internal-secret  ");

        assertThat(properties.resolveSecret()).isEqualTo("configured-internal-secret");
        assertThat(properties.isUsingDefaultSecret()).isFalse();
    }

    @Test
    @DisplayName("未配置或只有空白时回落到默认常量")
    void fallsBackToDefaultSecret() {
        InternalSecretProperties properties = new InternalSecretProperties();
        assertThat(properties.resolveSecret()).isEqualTo(SecurityConstants.INTERNAL_SECRET);

        properties.setSecret("   ");
        assertThat(properties.resolveSecret()).isEqualTo(SecurityConstants.INTERNAL_SECRET);
        assertThat(properties.isUsingDefaultSecret()).isTrue();
    }

    @Test
    @DisplayName("非 dev profile 回落到默认密钥时需要告警，dev 下不告警")
    void warnsOutsideDevProfile() {
        InternalSecretProperties properties = new InternalSecretProperties();

        assertThat(properties.shouldWarnDefaultSecret(new String[]{"prod"})).isTrue();
        assertThat(properties.shouldWarnDefaultSecret(new String[0])).isTrue();
        assertThat(properties.shouldWarnDefaultSecret(new String[]{"dev"})).isFalse();
    }

    @Test
    @DisplayName("配置了自己的密钥时任何 profile 都不告警")
    void doesNotWarnWhenConfigured() {
        InternalSecretProperties properties = new InternalSecretProperties();
        properties.setSecret("configured-internal-secret");

        assertThat(properties.shouldWarnDefaultSecret(new String[]{"prod"})).isFalse();
    }
}
