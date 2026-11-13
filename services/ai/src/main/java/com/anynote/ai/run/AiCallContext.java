package com.anynote.ai.run;

import com.anynote.system.api.model.bo.LoginUser;

/**
 * 一次 AI 调用的身份上下文，在请求线程上创建后显式传递给后续线程。
 *
 * @author 称霸幼儿园
 */
public class AiCallContext {

    private final LoginUser loginUser;

    private final String accessToken;

    public AiCallContext(LoginUser loginUser, String accessToken) {
        this.loginUser = loginUser;
        this.accessToken = accessToken;
    }

    public LoginUser getLoginUser() {
        return loginUser;
    }

    public String getAccessToken() {
        return accessToken;
    }

    /**
     * 当前登录用户 id。
     *
     * @return 用户 id，登录用户为空时返回 null
     */
    public Long getUserId() {
        return loginUser == null ? null : loginUser.getUserId();
    }
}
