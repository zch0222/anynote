package com.anynote.ai.config;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * RestClient 配置：按 Nacos 服务名负载均衡访问 Python 服务。
 *
 * @author 称霸幼儿园
 */
@Configuration
public class RestClientConfig {

    /**
     * 负载均衡的 RestClient 构造器。
     *
     * @return RestClient 构造器
     */
    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}
