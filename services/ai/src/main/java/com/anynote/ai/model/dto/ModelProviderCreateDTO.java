package com.anynote.ai.model.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.ToString;

import java.net.URI;
import java.util.List;

/**
 * 模型供应商新增请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "模型供应商新增请求")
public class ModelProviderCreateDTO {

    @NotBlank(message = "供应商标识不能为空")
    @Size(max = 64, message = "供应商标识长度不能超过 64")
    @Schema(description = "供应商标识", requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 64)
    private String providerKey;

    @NotBlank(message = "供应商展示名不能为空")
    @Size(max = 128, message = "供应商展示名长度不能超过 128")
    @Schema(description = "供应商展示名", requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 128)
    private String displayName;

    @Size(max = 32, message = "协议类型长度不能超过 32")
    @Schema(description = "协议类型，默认 openai_compatible", maxLength = 32)
    private String protocol;

    @NotBlank(message = "接口基地址不能为空")
    @Size(max = 512, message = "接口基地址长度不能超过 512")
    @Schema(description = "HTTP 或 HTTPS 接口基地址", requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 512)
    private String baseUrl;

    @ToString.Exclude
    @NotBlank(message = "请输入 API Key")
    @Schema(description = "API Key 明文，仅用于入参", requiredMode = Schema.RequiredMode.REQUIRED)
    private String apiKey;

    @Schema(description = "模型名数组")
    private List<String> models;

    @Schema(description = "是否允许知识库内容发送至该供应商")
    private Boolean dataEgressAllowed;

    @Schema(description = "是否启用")
    private Boolean enabled;

    /**
     * 校验接口地址的协议与主机。
     *
     * @return 合法 HTTP/HTTPS 地址返回 true
     */
    @AssertTrue(message = "接口基地址必须是有效的 HTTP 或 HTTPS 地址")
    @JsonIgnore
    @Schema(hidden = true)
    public boolean isBaseUrlValid() {
        if (baseUrl == null) {
            return true;
        }
        try {
            URI uri = URI.create(baseUrl);
            return ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                    && uri.getHost() != null;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
