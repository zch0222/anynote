package com.anynote.gateway.filter;

import com.alibaba.fastjson2.JSON;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.web.enums.ResCode;
import com.anynote.gateway.properties.SecurityIgnoreProperties;
import com.anynote.gateway.properties.SecurityManageProperties;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthFilterTest {
    @Mock
    private TokenUtil tokenUtil;
    @Mock
    private GatewayFilterChain chain;
    @InjectMocks
    private AuthFilter filter;

    @BeforeEach
    void configureRoutes() {
        SecurityIgnoreProperties ignore = new SecurityIgnoreProperties();
        ignore.setWhites(List.of("/api/auth/login", "/auth/v3/api-docs"));
        SecurityManageProperties manage = new SecurityManageProperties();
        manage.setUrls(List.of("/api/manage/**"));
        ReflectionTestUtils.setField(filter, "securityIgnoreProperties", ignore);
        ReflectionTestUtils.setField(filter, "securityManageProperties", manage);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Bearer signed.jwt.token", "bearer signed.jwt.token", "BEARER   signed.jwt.token"})
    void acceptsBearerAndBuildsTrustedInternalHeaders(String authorization) {
        when(tokenUtil.getLoginUser("signed.jwt.token")).thenReturn(user("USER"));
        when(chain.filter(any())).thenAnswer(invocation -> {
            ServerWebExchange forwarded = invocation.getArgument(0);
            HttpHeaders headers = forwarded.getRequest().getHeaders();
            assertThat(headers.get(SecurityConstants.ACCESS_TOKEN)).containsExactly("signed.jwt.token");
            assertThat(headers.getFirst(SecurityConstants.DETAILS_USER_ID)).isEqualTo("42");
            assertThat(headers.getFirst(HttpHeaders.AUTHORIZATION)).isNull();
            assertThat(headers.getFirst(SecurityConstants.FROM_SOURCE)).isNull();
            return Mono.empty();
        });
        MockServerWebExchange exchange = exchange(MockServerHttpRequest.get("/api/note/notes")
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .header(SecurityConstants.ACCESS_TOKEN, "untrusted-old-token")
                .header(SecurityConstants.DETAILS_USER_ID, "999")
                .header(SecurityConstants.FROM_SOURCE, "inner"));

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        verify(tokenUtil).getLoginUser("signed.jwt.token");
        verify(chain).filter(any());
    }

    @Test
    void rejectsOldAccessTokenHeaderWithoutBearer() {
        assertUnauthorized(exchange(MockServerHttpRequest.get("/api/note/notes")
                .header(SecurityConstants.ACCESS_TOKEN, "old-token")), ResCode.ACCESS_TOKEN_NOT_FOUND);
        verifyNoInteractions(tokenUtil);
    }

    @Test
    void doesNotReadTokenFromCookieOrQuery() {
        assertUnauthorized(exchange(MockServerHttpRequest.get("/api/note/notes?accessToken=old-token")
                .header(HttpHeaders.COOKIE, "at=old-token; accessToken=old-token")), ResCode.ACCESS_TOKEN_NOT_FOUND);
        verifyNoInteractions(tokenUtil);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Bearer", "Bearer ", "Basic dXNlcjpwYXNz", "Bearer token other", "Bearer token,other", "Bearer\ttoken", "Bearer token ", "Bearer token=other"})
    void rejectsMalformedBearerWithoutFallingBackToOldHeader(String authorization) {
        assertUnauthorized(exchange(MockServerHttpRequest.get("/api/note/notes")
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .header(SecurityConstants.ACCESS_TOKEN, "old-token")), ResCode.ACCESS_TOKEN_NOT_FOUND);
        verifyNoInteractions(tokenUtil);
    }

    @Test
    void rejectsDuplicateAuthorizationHeaders() {
        assertUnauthorized(exchange(MockServerHttpRequest.get("/api/note/notes")
                .header(HttpHeaders.AUTHORIZATION, "Bearer first", "Bearer second")), ResCode.ACCESS_TOKEN_NOT_FOUND);
        verifyNoInteractions(tokenUtil);
    }

    @Test
    void rejectsMissingCredentials() {
        assertUnauthorized(exchange(MockServerHttpRequest.get("/api/note/notes")), ResCode.ACCESS_TOKEN_NOT_FOUND);
        verifyNoInteractions(tokenUtil);
    }

    @Test
    void rejectsInvalidBearerEvenWhenOldHeaderIsPresent() {
        when(tokenUtil.getLoginUser("invalid-token")).thenReturn(null);
        assertUnauthorized(exchange(MockServerHttpRequest.get("/api/note/notes")
                .header(HttpHeaders.AUTHORIZATION, "Bearer invalid-token")
                .header(SecurityConstants.ACCESS_TOKEN, "old-token")), ResCode.ACCESS_TOKEN_NOT_FOUND);
        verify(tokenUtil).getLoginUser("invalid-token");
    }

    @Test
    void keepsPublicRoutesAccessibleWithoutToken() {
        when(chain.filter(any())).thenReturn(Mono.empty());
        MockServerWebExchange exchange = exchange(MockServerHttpRequest.post("/api/auth/login"));
        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();
        verify(chain).filter(exchange);
        verifyNoInteractions(tokenUtil);
    }

    @Test
    void deniesNonAdminOnManagementRoutes() {
        when(tokenUtil.getLoginUser("user-token")).thenReturn(user("USER"));
        assertUnauthorized(exchange(MockServerHttpRequest.get("/api/manage/users")
                .header(HttpHeaders.AUTHORIZATION, "Bearer user-token")), ResCode.UNAUTHORIZED_ERROR);
    }

    @Test
    void acceptsAdminOnManagementRoutes() {
        when(tokenUtil.getLoginUser("admin-token")).thenReturn(user(SecurityConstants.ADMIN_X));
        when(chain.filter(any())).thenReturn(Mono.empty());
        StepVerifier.create(filter.filter(exchange(MockServerHttpRequest.get("/api/manage/users")
                .header(HttpHeaders.AUTHORIZATION, "Bearer admin-token")), chain)).verifyComplete();
        verify(chain).filter(any());
    }

    private void assertUnauthorized(MockServerWebExchange exchange, ResCode code) {
        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        String body = exchange.getResponse().getBodyAsString().block();
        assertThat(JSON.parseObject(body).getString("code")).isEqualTo(code.getCode());
        verifyNoInteractions(chain);
    }

    private MockServerWebExchange exchange(MockServerHttpRequest.BaseBuilder<?> request) {
        return MockServerWebExchange.from(request.build());
    }

    private LoginUser user(String roleKey) {
        SysRole role = new SysRole();
        role.setRoleKey(roleKey);
        SysUser sysUser = new SysUser();
        sysUser.setId(42L);
        sysUser.setRole(role);
        LoginUser user = new LoginUser();
        user.setUserId(42L);
        user.setSysUser(sysUser);
        return user;
    }
}
