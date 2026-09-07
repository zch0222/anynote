package com.anynote.auth.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 刷新 Token 请求
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "刷新 Token 请求")
public class RefreshTokenDTO {

    @NotBlank
    @Schema(description = "登录时获得的 refreshToken", requiredMode = Schema.RequiredMode.REQUIRED)
    private String refreshToken;
}
