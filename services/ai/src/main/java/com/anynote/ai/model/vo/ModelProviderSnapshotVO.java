package com.anynote.ai.model.vo;

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
 * <p>{@link #version} 由「供应商行 version 的最大值、各逻辑模型 version 之和与检索参数版本」相加而成；
 * 逻辑模型映射唯一来源是数据库 {@code a_logical_model}，不再读取 Nacos。空表时各部分为 0。
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
     * 快照版本号，各配置来源版本之和。
     */
    @Schema(description = "快照版本号：供应商、逻辑模型与检索参数版本之和，任一变更即变化")
    private String version;

    /**
     * 供应商列表，按主键升序。
     */
    @Schema(description = "供应商列表")
    private List<ProviderVO> providers;

    /**
     * 数据库 a_logical_model 中的逻辑模型映射，按逻辑名称升序。
     */
    @Schema(description = "逻辑模型名到供应商模型的映射，唯一来源是数据库")
    private Map<String, LogicalModelVO> logicalModels;

    /**
     * 知识检索运行参数，运行开始时读取一次。
     */
    @Schema(description = "知识检索运行参数")
    private RetrievalSettingVO retrieval;

    /**
     * 单个逻辑模型映射。
     *
     * @author 称霸幼儿园
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "逻辑模型映射")
    public static class LogicalModelVO {

        /**
         * 供应商标识，对应 {@code a_model_provider.provider_key}。
         */
        @Schema(description = "供应商标识")
        private String provider;

        /**
         * 供应商侧实际模型名。
         */
        @Schema(description = "供应商侧模型名")
        private String model;

        /**
         * 是否启用。
         */
        @Schema(description = "是否启用")
        private Boolean enabled;

        /**
         * 期望向量维度（仅 embedding）。
         */
        @Schema(description = "期望向量维度（仅 embedding）")
        private Integer dimensions;

        /**
         * 推理输出格式。
         */
        @Schema(description = "推理输出格式：none / reasoning_content / reasoning / think_tag")
        private String reasoningFormat;

        /**
         * 推理回传方式。
         */
        @Schema(description = "推理回传方式：none / empty / original")
        private String reasoningPassthrough;
    }

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
        private transient String apiKey;

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
