package com.anynote.common.security.feign;

import com.anynote.common.security.properties.InternalSecretProperties;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.utils.HmacUtils;
import feign.RequestTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link FeignRequestInterceptor} 单元测试：内部调用头用可配置的密钥签名。
 *
 * @author 称霸幼儿园
 */
class FeignRequestInterceptorTest {

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    @DisplayName("签名头用配置的密钥计算，被调端用同一密钥能验过")
    void signsWithConfiguredSecret() {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        InternalSecretProperties properties = new InternalSecretProperties();
        properties.setSecret("configured-internal-secret-0123");
        RequestTemplate template = new RequestTemplate();

        new FeignRequestInterceptor(properties).apply(template);

        String timestamp = template.headers().get(SecurityConstants.INTERNAL_TIMESTAMP).iterator().next();
        String sign = template.headers().get(SecurityConstants.INTERNAL_SIGN).iterator().next();
        assertThat(template.headers().get(SecurityConstants.FROM_SOURCE)).containsExactly(SecurityConstants.INNER);
        assertThat(HmacUtils.verify("configured-internal-secret-0123", timestamp, sign)).isTrue();
        assertThat(HmacUtils.verify(SecurityConstants.INTERNAL_SECRET, timestamp, sign)).isFalse();
    }
}
