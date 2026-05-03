package com.anynote.gateway.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;

/**
 * Spring Security 配置类（Gateway WebFlux）
 * Spring Security 6.x: @EnableWebFluxSecurity 已内置自动配置，无需显式声明
 */
@Configuration
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity httpSecurity) {
        httpSecurity
                .csrf(csrf -> csrf.disable())
                .headers(headers -> headers.frameOptions(frameOptions -> frameOptions.disable()))
                .authorizeExchange(exchanges -> exchanges.anyExchange().permitAll());
        return httpSecurity.build();
    }

}
