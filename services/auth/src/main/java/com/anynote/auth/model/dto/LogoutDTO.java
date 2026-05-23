package com.anynote.auth.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 登出请求
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "登出请求；服务端会清除指定 token 的 Redis 缓存")
public class LogoutDTO {

    @NotBlank
    @Schema(description = "当前会话的 accessToken", requiredMode = Schema.RequiredMode.REQUIRED)
    private String accessToken;

    @Schema(description = "当前会话的 refreshToken（可选；若提供会同时失效）")
    private String refreshToken;
}
