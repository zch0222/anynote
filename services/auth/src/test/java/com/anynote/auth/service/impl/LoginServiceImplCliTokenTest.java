package com.anynote.auth.service.impl;

import com.anynote.auth.model.vo.CliTokenVO;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.auth.LoginException;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.bo.Token;
import com.anynote.system.api.model.po.SysUser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link LoginServiceImpl#issueCliToken()} 纯单元测试——不加载 Spring 上下文。
 *
 * 覆盖 Phase 5 之外的 CLI 浏览器授权登录：为 CLI 另发一对令牌、身份取自当前请求上下文、
 * 以及"不污染会话对象"这条容易踩的边界（TokenUtil.createToken 会把 token 写回入参实例）。
 */
@ExtendWith(MockitoExtension.class)
class LoginServiceImplCliTokenTest {

    @Mock
    private TokenUtil tokenUtil;

    @InjectMocks
    private LoginServiceImpl loginService;

    private static SysUser sysUser() {
        SysUser user = new SysUser();
        user.setId(42L);
        user.setUsername("alice");
        user.setNickname("小爱");
        return user;
    }

    private static LoginUser sessionUser() {
        return new LoginUser(sysUser(), Set.of("note:read"), "USER", false);
    }

    @Test
    @DisplayName("issueCliToken：返回新令牌与被授权用户信息")
    void issuesTokenForCurrentUser() {
        Token issued = new Token();
        issued.setAccessToken("cli-at");
        issued.setRefreshToken("cli-rt");
        when(tokenUtil.getLoginUser()).thenReturn(sessionUser());
        when(tokenUtil.createToken(any(LoginUser.class))).thenReturn(issued);

        CliTokenVO actual = loginService.issueCliToken();

        assertThat(actual.getUsername()).isEqualTo("alice");
        assertThat(actual.getNickname()).isEqualTo("小爱");
        assertThat(actual.getToken()).isSameAs(issued);
        assertThat(actual.getToken().getAccessToken()).isEqualTo("cli-at");
        assertThat(actual.getToken().getRefreshToken()).isEqualTo("cli-rt");
    }

    @Test
    @DisplayName("issueCliToken：新 LoginUser 复制了角色、权限与 longTerm，令牌生命周期与原会话一致")
    void copiesIdentityFieldsOntoNewLoginUser() {
        when(tokenUtil.getLoginUser()).thenReturn(sessionUser());
        when(tokenUtil.createToken(any(LoginUser.class))).thenReturn(new Token());

        loginService.issueCliToken();

        ArgumentCaptor<LoginUser> captor = ArgumentCaptor.forClass(LoginUser.class);
        verify(tokenUtil).createToken(captor.capture());
        LoginUser issued = captor.getValue();
        assertThat(issued.getSysUser().getId()).isEqualTo(42L);
        assertThat(issued.getSysUser().getUsername()).isEqualTo("alice");
        assertThat(issued.getPermissions()).containsExactly("note:read");
        assertThat(issued.getRole()).isEqualTo("USER");
        assertThat(issued.isLongTerm()).isFalse();
    }

    @Test
    @DisplayName("issueCliToken：传入 TokenUtil 的不是会话里那个对象，避免 createToken 回写污染当前会话")
    void doesNotReuseSessionInstance() {
        LoginUser session = sessionUser();
        when(tokenUtil.getLoginUser()).thenReturn(session);
        when(tokenUtil.createToken(any(LoginUser.class))).thenReturn(new Token());

        loginService.issueCliToken();

        ArgumentCaptor<LoginUser> captor = ArgumentCaptor.forClass(LoginUser.class);
        verify(tokenUtil).createToken(captor.capture());
        assertThat(captor.getValue()).isNotSameAs(session);
        // 会话对象上的 token 字段必须保持原样（此处本来就是 null）
        assertThat(session.getToken()).isNull();
    }

    @Test
    @DisplayName("issueCliToken：当前请求没有登录用户时抛 LoginException，且不签发任何令牌")
    void rejectsWhenNoLoginUser() {
        when(tokenUtil.getLoginUser()).thenReturn(null);

        assertThatThrownBy(() -> loginService.issueCliToken())
                .isInstanceOf(LoginException.class);

        verify(tokenUtil, never()).createToken(any(LoginUser.class));
    }

    @Test
    @DisplayName("issueCliToken：LoginUser 缺少 sysUser（脏缓存）时同样拒绝签发")
    void rejectsWhenLoginUserHasNoSysUser() {
        LoginUser broken = new LoginUser();
        broken.setUsername("alice");
        when(tokenUtil.getLoginUser()).thenReturn(broken);

        assertThatThrownBy(() -> loginService.issueCliToken())
                .isInstanceOf(LoginException.class);

        verify(tokenUtil, never()).createToken(any(LoginUser.class));
    }
}
