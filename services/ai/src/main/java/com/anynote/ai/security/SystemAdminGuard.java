package com.anynote.ai.security;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import org.springframework.stereotype.Component;

/**
 * 系统管理员准入校验。
 *
 * @author 称霸幼儿园
 */
@Component
public class SystemAdminGuard {

    public static final String ADMIN_ONLY_MESSAGE = "只有系统管理员可以管理模型供应商";

    private final TokenUtil tokenUtil;

    /**
     * 构造器注入。
     *
     * @param tokenUtil 登录用户读取组件
     */
    public SystemAdminGuard(TokenUtil tokenUtil) {
        this.tokenUtil = tokenUtil;
    }

    /**
     * 要求当前用户具有 ADMIN_X 角色。
     *
     * @return 已验证的登录用户
     */
    public LoginUser requireAdmin() {
        LoginUser loginUser = tokenUtil.getLoginUser();
        SysUser sysUser = loginUser.getSysUser();
        SysRole role = sysUser.getRole();
        if (role == null || role.getRoleKey() == null || !SysUser.isAdminX(role)) {
            throw new AuthException(ADMIN_ONLY_MESSAGE, ResCode.UNAUTHORIZED_ERROR);
        }
        return loginUser;
    }
}
