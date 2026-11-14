package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;
import java.util.List;

/**
 * 系统管理员可见的模型供应商信息，不包含任何凭据。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "模型供应商管理信息，不包含 API Key")
public class ModelProviderAdminVO {

    @Schema(description = "供应商标识")
    private String providerKey;

    @Schema(description = "供应商展示名")
    private String displayName;

    @Schema(description = "协议类型")
    private String protocol;

    @Schema(description = "接口基地址")
    private String baseUrl;

    @Schema(description = "模型名列表")
    private List<String> models;

    @Schema(description = "是否允许知识库内容发送至该供应商")
    private Boolean dataEgressAllowed;

    @Schema(description = "是否启用")
    private Boolean enabled;

    @Schema(description = "配置版本号")
    private Long version;

    @Schema(description = "创建时间")
    private Date createTime;

    @Schema(description = "更新时间")
    private Date updateTime;
}
