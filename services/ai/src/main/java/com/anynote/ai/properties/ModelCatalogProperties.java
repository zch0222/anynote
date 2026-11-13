package com.anynote.ai.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 模型目录非敏感映射配置。
 *
 * <p>从 Nacos 读取「逻辑模型名 → 供应商 + 供应商侧模型名」的映射，本配置不包含任何凭据。
 * 凭据（apiKey）只以 AES-GCM 密文存在于业务库 {@code a_model_provider} 表，主密钥只通过
 * services/ai 的环境变量注入。</p>
 *
 * @author 称霸幼儿园
 */
@Component
@Data
@ConfigurationProperties(prefix = "anynote.ai.models")
public class ModelCatalogProperties {

    /**
     * 映射版本号，随 Nacos 配置变更递增；参与快照版本号拼接（{@code providersVersion:mappingVersion}）。
     */
    private int mappingVersion = 0;

    /**
     * 逻辑模型名到供应商模型的映射；未配置时为空 Map。
     */
    private Map<String, LogicalModel> logical = new LinkedHashMap<>();

    /**
     * 单个逻辑模型映射。
     *
     * @author 称霸幼儿园
     */
    @Data
    public static class LogicalModel {

        /**
         * 供应商标识，对应 {@code a_model_provider.provider_key}。
         */
        private String provider;

        /**
         * 供应商侧实际模型名。
         */
        private String model;
    }
}
