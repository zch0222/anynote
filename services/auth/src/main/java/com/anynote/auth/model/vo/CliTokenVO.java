package com.anynote.auth.model.vo;

import com.anynote.system.api.model.bo.Token;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * CLI 授权登录的令牌响应。
 *
 * <p>与 {@link com.anynote.auth.model.dto.LoginDTO} 的区别：这里是**为 CLI 另发的一对独立
 * 令牌**（同一个用户、但与会话里那一对互不影响，各自登出），因此不复用登录响应体，
 * 也不带 avatar / role 这些 CLI 用不到的字段。
 *
 * @author 称霸幼儿园
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "CLI 授权登录响应；token 是与浏览器会话相互独立的一对新令牌")
public class CliTokenVO {

    @Schema(description = "被授权用户的用户名")
    private String username;

    @Schema(description = "被授权用户的昵称")
    private String nickname;

    @Schema(description = "为 CLI 新签发的 accessToken / refreshToken 对", requiredMode = Schema.RequiredMode.REQUIRED)
    private Token token;
}
