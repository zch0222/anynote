package com.anynote.common.security.aspect;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.common.security.properties.InternalSecretProperties;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.exception.auth.InnerAuthException;
import com.anynote.core.utils.HmacUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.annotation.Annotation;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link InnerAuthAspect} 单元测试：签名校验使用可配置的内部密钥。
 *
 * @author 称霸幼儿园
 */
class InnerAuthAspectTest {

    private static final String CONFIGURED_SECRET = "configured-internal-secret-0123";

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    private static InnerAuth innerAuth() {
        return new InnerAuth() {
            @Override
            public boolean isUser() {
                return false;
            }

            @Override
            public Class<? extends Annotation> annotationType() {
                return InnerAuth.class;
            }
        };
    }

    private static void bindRequest(String source, String secret) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (source != null) {
            request.addHeader(SecurityConstants.FROM_SOURCE, source);
        }
        String timestamp = String.valueOf(System.currentTimeMillis());
        request.addHeader(SecurityConstants.INTERNAL_TIMESTAMP, timestamp);
        request.addHeader(SecurityConstants.INTERNAL_SIGN, HmacUtils.sign(secret, timestamp));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    private static InnerAuthAspect aspectWithSecret(String secret) {
        InternalSecretProperties properties = new InternalSecretProperties();
        properties.setSecret(secret);
        return new InnerAuthAspect(properties);
    }

    @Test
    @DisplayName("用配置的密钥签名的内部请求通过校验")
    void acceptsRequestSignedWithConfiguredSecret() {
        bindRequest(SecurityConstants.INNER, CONFIGURED_SECRET);

        assertThatCode(() -> aspectWithSecret(CONFIGURED_SECRET).doBefore(null, innerAuth()))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("配置了自己的密钥后，用仓库里公开的默认密钥签名会被拒绝")
    void rejectsDefaultSecretOnceConfigured() {
        bindRequest(SecurityConstants.INNER, SecurityConstants.INTERNAL_SECRET);

        assertThatThrownBy(() -> aspectWithSecret(CONFIGURED_SECRET).doBefore(null, innerAuth()))
                .isInstanceOf(InnerAuthException.class)
                .hasMessageContaining("签名");
    }

    @Test
    @DisplayName("未配置密钥时回落到默认密钥，开发环境的既有调用不受影响")
    void acceptsDefaultSecretWhenNotConfigured() {
        bindRequest(SecurityConstants.INNER, SecurityConstants.INTERNAL_SECRET);

        assertThatCode(() -> aspectWithSecret(null).doBefore(null, innerAuth()))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("缺少 from-source: inner 时直接拒绝")
    void rejectsMissingSourceHeader() {
        bindRequest(null, CONFIGURED_SECRET);

        assertThatThrownBy(() -> aspectWithSecret(CONFIGURED_SECRET).doBefore(null, innerAuth()))
                .isInstanceOf(InnerAuthException.class);
    }
}
