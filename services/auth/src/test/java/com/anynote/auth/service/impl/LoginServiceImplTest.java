package com.anynote.auth.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.auth.LoginException;
import com.anynote.system.api.model.bo.Token;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * {@link LoginServiceImpl} 纯单元测试——不加载 Spring 上下文，不依赖任何中间件。
 * 覆盖 Phase 5 M2.0 新增的 refresh / logout 的参数校验与委托行为。
 */
@ExtendWith(MockitoExtension.class)
class LoginServiceImplTest {

    @Mock
    private TokenUtil tokenUtil;

    @InjectMocks
    private LoginServiceImpl loginService;

    @Test
    @DisplayName("refresh：合法 refreshToken 委托给 TokenUtil 并原样返回轮换后的 Token")
    void refreshDelegatesToTokenUtil() {
        Token rotated = new Token();
        rotated.setAccessToken("new-at");
        rotated.setRefreshToken("new-rt");
        when(tokenUtil.refreshToken("old-rt")).thenReturn(rotated);

        Token actual = loginService.refresh("old-rt");

        assertThat(actual).isSameAs(rotated);
        assertThat(actual.getAccessToken()).isEqualTo("new-at");
        assertThat(actual.getRefreshToken()).isEqualTo("new-rt");
        verify(tokenUtil).refreshToken("old-rt");
    }

    @ParameterizedTest(name = "refresh([{0}]) 抛 LoginException")
    @NullSource
    @ValueSource(strings = {"", "   "})
    @DisplayName("refresh：refreshToken 为空时抛 LoginException，且不触碰 TokenUtil")
    void refreshRejectsBlankToken(String blank) {
        assertThatThrownBy(() -> loginService.refresh(blank))
                .isInstanceOf(LoginException.class)
                .hasMessageContaining("refreshToken");

        verifyNoInteractions(tokenUtil);
    }

    @Test
    @DisplayName("logout：accessToken + refreshToken 一并透传给 TokenUtil")
    void logoutDelegatesBothTokens() {
        loginService.logout("at", "rt");

        verify(tokenUtil).logout("at", "rt");
    }

    @Test
    @DisplayName("logout：refreshToken 可缺省，null 原样透传（幂等性由 TokenUtil 负责）")
    void logoutAllowsNullRefreshToken() {
        loginService.logout("at", null);

        verify(tokenUtil).logout("at", null);
    }

    @ParameterizedTest(name = "logout([{0}], \"rt\") 抛 LoginException")
    @NullSource
    @ValueSource(strings = {"", "   "})
    @DisplayName("logout：accessToken 为空时抛 LoginException，且不触碰 TokenUtil")
    void logoutRejectsBlankAccessToken(String blank) {
        assertThatThrownBy(() -> loginService.logout(blank, "rt"))
                .isInstanceOf(LoginException.class)
                .hasMessageContaining("accessToken");

        verifyNoInteractions(tokenUtil);
    }

    @ParameterizedTest(name = "login(\"{0}\", \"{1}\") 抛 LoginException")
    @CsvSource({
            "'',     'password'",
            "'user', ''",
            "'u',    'password'",
            "'user', '1234'",
    })
    @DisplayName("login：用户名 / 密码长度不合法时，在调用远程用户服务之前就失败")
    void loginRejectsInvalidCredentials(String username, String password) {
        assertThatThrownBy(() -> loginService.login(username, password))
                .isInstanceOf(LoginException.class);

        verifyNoInteractions(tokenUtil);
    }
}
