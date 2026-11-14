package com.anynote.ai.security;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

/**
 * 系统管理员角色准入单测。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class SystemAdminGuardTest {

    @Mock
    private TokenUtil tokenUtil;

    @Test
    @DisplayName("ADMIN_X 可以管理供应商并返回操作者")
    void adminShouldPass() {
        SystemAdminGuard guard = new SystemAdminGuard(tokenUtil);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser("ADMIN_X"));
        assertEquals(7L, guard.requireAdmin().getUserId());
    }

    @Test
    @DisplayName("普通角色和缺失角色均被拒绝")
    void nonAdminShouldBeRejected() {
        SystemAdminGuard guard = new SystemAdminGuard(tokenUtil);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser("MEMBER"));
        AuthException member = assertThrows(AuthException.class, guard::requireAdmin);
        assertEquals(ResCode.UNAUTHORIZED_ERROR, member.getErrorCode());
        assertEquals("只有系统管理员可以管理模型供应商", member.getErrorMessage());

        LoginUser withoutRole = loginUser("MEMBER");
        withoutRole.getSysUser().setRole(null);
        when(tokenUtil.getLoginUser()).thenReturn(withoutRole);
        assertThrows(AuthException.class, guard::requireAdmin);
    }

    private LoginUser loginUser(String roleKey) {
        SysRole role = new SysRole();
        role.setRoleKey(roleKey);
        SysUser user = new SysUser();
        user.setId(7L);
        user.setUsername("tester");
        user.setRole(role);
        return new LoginUser(user, Set.of(), roleKey, false);
    }
}
