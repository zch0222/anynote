package com.anynote.common.security.feign;

import com.anynote.common.security.properties.InternalSecretProperties;
import feign.RequestInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Feign 配置注册
 *
 * @author 称霸幼儿园
 */
@Configuration
public class FeignAutoConfiguration {

    @Bean
    public RequestInterceptor requestInterceptor(InternalSecretProperties internalSecretProperties) {
        return new FeignRequestInterceptor(internalSecretProperties);
    }
}
