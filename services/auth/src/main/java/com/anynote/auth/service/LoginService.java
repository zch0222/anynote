package com.anynote.auth.service;

import com.anynote.auth.model.dto.RegisterDTO;
import com.anynote.auth.model.dto.ResetPasswordDTO;
import com.anynote.auth.model.vo.CliTokenVO;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.bo.Token;

/**
 * 登录服务
 * @author 称霸幼儿园
 */
public interface LoginService {

    /**
     * 登录
     * @param username 用户名
     * @param password 密码
     * @return 登录用户信息
     */
    LoginUser login(String username, String password);

    LoginUser resetPassword(ResetPasswordDTO resetPasswordDTO);

    LoginUser register(RegisterDTO registerDTO);

    /**
     * 使用 refreshToken 换取新 Token（access + refresh 同时旋转）
     * @param refreshToken 当前会话的 refreshToken
     * @return 新的 Token（含新 accessToken / refreshToken）
     */
    Token refresh(String refreshToken);

    /**
     * 单会话登出：清除指定 token 的 Redis 缓存，至少提供一个非空白 token
     * @param accessToken 当前会话 accessToken（可选）
     * @param refreshToken 当前会话 refreshToken（可选，可单独提供）
     */
    void logout(String accessToken, String refreshToken);

    /**
     * 为 CLI 授权登录**另发**一对令牌。
     *
     * <p>与 {@link #login} 的区别是它不校验口令：调用方身份已由网关用 Bearer
     * accessToken 验证过（浏览器会话用户点了「授权」）。新令牌与浏览器会话那一对
     * 在 Redis 里各占一个 key，因此 CLI 登出不会把网页踢下线，反之亦然。
     *
     * @return 携带新令牌与被授权用户名的响应体
     */
    CliTokenVO issueCliToken();
}
