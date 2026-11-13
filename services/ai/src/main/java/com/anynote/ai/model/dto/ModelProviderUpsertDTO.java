package com.anynote.ai.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 模型供应商新增/更新请求。
 *
 * <p>{@link #apiKey} 为明文入参，服务端加密后再入库，任何日志与响应中都不出现该明文。</p>
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "模型供应商新增/更新请求")
public class ModelProviderUpsertDTO {

    /**
     * 供应商标识，唯一，最大 64 字符。
     */
    @NotBlank(message = "供应商标识不能为空")
    @Size(max = 64, message = "供应商标识长度不能超过 64")
    @Schema(description = "供应商标识（唯一）", requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 64)
    private String providerKey;

    /**
     * 供应商展示名，最大 128 字符。
     */
    @NotBlank(message = "供应商展示名不能为空")
    @Size(max = 128, message = "供应商展示名长度不能超过 128")
    @Schema(description = "供应商展示名", requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 128)
    private String displayName;

    /**
     * 协议类型，为空时新增使用 {@code openai_compatible}、更新保留原值。
     */
    @Size(max = 32, message = "协议类型长度不能超过 32")
    @Schema(description = "协议类型，默认 openai_compatible", maxLength = 32)
    private String protocol;

    /**
     * 接口基地址，最大 512 字符。
     */
    @NotBlank(message = "接口基地址不能为空")
    @Size(max = 512, message = "接口基地址长度不能超过 512")
    @Schema(description = "接口基地址", requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 512)
    private String baseUrl;

    /**
     * API Key 明文入参，服务端 AES-GCM 加密后入库。
     */
    @NotBlank(message = "API Key 不能为空")
    @Schema(description = "API Key 明文，仅用于入参，服务端加密后入库", requiredMode = Schema.RequiredMode.REQUIRED)
    private String apiKey;

    /**
     * 模型名数组；为空时新增写空数组、更新保留原值。
     */
    @Schema(description = "模型名数组")
    private List<String> models;

    /**
     * 是否允许数据出境；为空时新增按 0、更新保留原值。
     */
    @Schema(description = "是否允许数据出境（默认 false）")
    private Boolean dataEgressAllowed;

    /**
     * 是否启用；为空时新增按 true、更新保留原值。
     */
    @Schema(description = "是否启用（默认 true）")
    private Boolean enabled;
}
