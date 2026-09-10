package com.anynote.auth.model.dto;

import com.anynote.core.utils.StringUtils;
import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import lombok.Data;

/**
 * 登出请求
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "登出请求；accessToken 与 refreshToken 至少提供一个非空白值，服务端仅清除所提供 token 的 Redis 缓存")
public class LogoutDTO {

    @Schema(description = "当前会话的 accessToken（可选；与 refreshToken 至少提供一个）")
    private String accessToken;

    @Schema(description = "当前会话的 refreshToken（可选；可单独提供以撤销刷新凭据）")
    private String refreshToken;

    @JsonIgnore
    @Schema(hidden = true)
    @AssertTrue(message = "accessToken 与 refreshToken 至少提供一个非空白值")
    public boolean isTokenProvided() {
        return StringUtils.isNotBlank(accessToken) || StringUtils.isNotBlank(refreshToken);
    }
}
