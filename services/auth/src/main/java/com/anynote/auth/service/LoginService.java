package com.anynote.auth.service;

import com.anynote.auth.model.dto.RegisterDTO;
import com.anynote.auth.model.dto.ResetPasswordDTO;
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
     * 单会话登出：清除指定 accessToken 与 refreshToken 的 Redis 缓存
     * @param accessToken 当前会话 accessToken（必填）
     * @param refreshToken 当前会话 refreshToken（可选）
     */
    void logout(String accessToken, String refreshToken);
}
