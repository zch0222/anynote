package com.anynote.ai.model.vo;

import com.anynote.ai.properties.ModelCatalogProperties;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * 模型供应商配置快照，供内部调用方（Python AI 服务）整体拉取。
 *
 * <p>{@link #version} 由「所有行 version 的最大值」与 Nacos 映射版本拼接而成，格式为
 * {@code ${providersVersion}:${mappingVersion}}；空表时 providersVersion 为 0。
 * 调用方可据此比对缓存是否过期。{@link #providers} 中的 {@code apiKey} 已是解密后的明文，
 * 本端点只允许内部签名调用。</p>
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "模型供应商配置快照")
public class ModelProviderSnapshotVO {

    /**
     * 快照版本号，格式 {@code providersVersion:mappingVersion}。
     */
    @Schema(description = "快照版本号，格式 providersVersion:mappingVersion，空表时 providersVersion 为 0")
    private String version;

    /**
     * 供应商列表，按主键升序。
     */
    @Schema(description = "供应商列表")
    private List<ProviderVO> providers;

    /**
     * Nacos 中的逻辑模型映射，原样下发。
     */
    @Schema(description = "逻辑模型名到供应商模型的映射")
    private Map<String, ModelCatalogProperties.LogicalModel> logicalModels;

    /**
     * 单个供应商快照，包含解密后的 API Key。
     *
     * @author 称霸幼儿园
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "供应商快照")
    public static class ProviderVO {

        /**
         * 供应商标识。
         */
        @Schema(description = "供应商标识")
        private String providerKey;

        /**
         * 供应商展示名。
         */
        @Schema(description = "供应商展示名")
        private String displayName;

        /**
         * 协议类型。
         */
        @Schema(description = "协议类型")
        private String protocol;

        /**
         * 接口基地址。
         */
        @Schema(description = "接口基地址")
        private String baseUrl;

        /**
         * 解密后的 API Key 明文，仅内部调用方在内存中使用。
         */
        @Schema(description = "解密后的 API Key 明文，仅内部调用方使用")
        private String apiKey;

        /**
         * 模型名数组。
         */
        @Schema(description = "模型名数组")
        private List<String> models;

        /**
         * 是否允许数据出境。
         */
        @Schema(description = "是否允许数据出境")
        private Boolean dataEgressAllowed;

        /**
         * 是否启用。
         */
        @Schema(description = "是否启用")
        private Boolean enabled;
    }
}
