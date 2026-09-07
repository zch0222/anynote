package com.anynote.common.security.token;

import com.alibaba.fastjson2.JSON;
import com.anynote.common.redis.enums.CachePrefixEnum;
import com.anynote.common.redis.service.RedisService;
import com.anynote.common.security.enums.SecurityEnum;
import com.anynote.common.security.properties.JWTTokenProperties;
import com.anynote.core.exception.auth.TokenException;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.bo.Token;
import com.anynote.system.api.model.po.SysUser;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/**
 * {@link TokenUtil} 纯单元测试——JWT 签发/校验用的是真实 HMAC 算法（无外部依赖），
 * 只有 Redis 被打桩。覆盖 Phase 5 M2.0 的 logout 与配套的 refreshToken 轮换逻辑。
 */
@ExtendWith(MockitoExtension.class)
class TokenUtilTest {

    private static final String SECRET = "unit-test-secret-do-not-use-in-prod";
    private static final long TOKEN_EXPIRE_MINUTES = 30L;
    private static final String USERNAME = "alice";

    @Mock
    private RedisService redisService;

    @Mock
    private AccessTokenProvider accessTokenProvider;

    private TokenUtil tokenUtil;

    @BeforeEach
    void setUp() {
        JWTTokenProperties properties = new JWTTokenProperties();
        properties.setSecret(SECRET);
        properties.setTokenExpireTime(TOKEN_EXPIRE_MINUTES);

        tokenUtil = new TokenUtil();
        // TokenUtil 用字段注入，单测里直接反射塞入，避免为它加构造器
        ReflectionTestUtils.setField(tokenUtil, "jwtTokenProperties", properties);
        ReflectionTestUtils.setField(tokenUtil, "redisService", redisService);
        ReflectionTestUtils.setField(tokenUtil, "accessTokenProvider", accessTokenProvider);
    }

    private static LoginUser loginUser(boolean longTerm) {
        SysUser sysUser = new SysUser();
        sysUser.setId(42L);
        sysUser.setUsername(USERNAME);

        LoginUser user = new LoginUser();
        user.setUserId(42L);
        user.setUsername(USERNAME);
        user.setSysUser(sysUser);
        user.setLongTerm(longTerm);
        return user;
    }

    /** 用任意密钥手工签一个 token，用于构造非法 / 过期场景。 */
    private static String signToken(String secret, LoginUser payload, Date expiresAt) {
        Map<String, Object> header = new HashMap<>();
        header.put("alg", "HS256");
        header.put("typ", "JWT");
        return JWT.create()
                .withHeader(header)
                .withClaim(SecurityEnum.USER_CONTEXT.getValue(), JSON.toJSONString(payload))
                .withExpiresAt(expiresAt)
                .withIssuedAt(new Date())
                .sign(Algorithm.HMAC256(secret));
    }

    private static String accessKey(String token) {
        return CachePrefixEnum.ACCESS_TOKEN.getPrefix(USERNAME) + token;
    }

    private static String refreshKey(String token) {
        return CachePrefixEnum.REFRESH_TOKEN.getPrefix(USERNAME) + token;
    }

    @Nested
    @DisplayName("createToken")
    class CreateToken {

        @Test
        @DisplayName("同时签发 accessToken 与 refreshToken，并写回 loginUser")
        void issuesBothTokens() {
            LoginUser user = loginUser(false);

            Token token = tokenUtil.createToken(user);

            assertThat(token.getAccessToken()).isNotBlank();
            assertThat(token.getRefreshToken()).isNotBlank();
            assertThat(token.getAccessToken()).isNotEqualTo(token.getRefreshToken());
            assertThat(user.getToken()).isSameAs(token);
        }

        @Test
        @DisplayName("两个 token 分别按 access / refresh 前缀写入 Redis，TTL 与配置一致")
        void writesBothRedisKeysWithTtl() {
            LoginUser user = loginUser(false);

            Token token = tokenUtil.createToken(user);

            verify(redisService).setCacheObject(
                    accessKey(token.getAccessToken()), user,
                    TOKEN_EXPIRE_MINUTES * 60, TimeUnit.SECONDS);
            verify(redisService).setCacheObject(
                    refreshKey(token.getRefreshToken()), user,
                    TOKEN_EXPIRE_MINUTES * 60 * 2, TimeUnit.SECONDS);
        }

        @Test
        @DisplayName("longTerm 用户的 refreshToken 走 15 天固定时长，不受 tokenExpireTime 影响")
        void longTermUserGetsFifteenDayRefreshToken() {
            LoginUser user = loginUser(true);

            Token token = tokenUtil.createToken(user);

            verify(redisService).setCacheObject(
                    refreshKey(token.getRefreshToken()), user,
                    15L * 24 * 60, TimeUnit.SECONDS);
        }

        @Test
        @DisplayName("签发的 accessToken 能被 authToken 解回同一用户")
        void issuedTokenIsSelfVerifiable() {
            LoginUser user = loginUser(false);

            Token token = tokenUtil.createToken(user);
            LoginUser parsed = tokenUtil.authToken(token.getAccessToken());

            assertThat(parsed).isNotNull();
            assertThat(parsed.getUsername()).isEqualTo(USERNAME);
            assertThat(parsed.getUserId()).isEqualTo(42L);
        }
    }

    @Nested
    @DisplayName("authToken")
    class AuthToken {

        @ParameterizedTest(name = "authToken([{0}]) 返回 null")
        @NullSource
        @ValueSource(strings = {"", "not-a-jwt", "a.b.c"})
        @DisplayName("空值与格式非法的 token 一律返回 null，不抛异常")
        void returnsNullForBlankOrMalformed(String token) {
            assertThat(tokenUtil.authToken(token)).isNull();
            verifyNoInteractions(redisService);
        }

        @Test
        @DisplayName("用别的密钥签的 token 验签失败，返回 null")
        void returnsNullWhenSignedWithOtherSecret() {
            String forged = signToken("some-other-secret", loginUser(false),
                    new Date(System.currentTimeMillis() + 60_000));

            assertThat(tokenUtil.authToken(forged)).isNull();
        }

        @Test
        @DisplayName("已过期的 token 返回 null")
        void returnsNullWhenExpired() {
            String expired = signToken(SECRET, loginUser(false),
                    new Date(System.currentTimeMillis() - 60_000));

            assertThat(tokenUtil.authToken(expired)).isNull();
        }
    }

    @Nested
    @DisplayName("refreshToken")
    class Refresh {

        @Test
        @DisplayName("轮换成功：签发新 token 并删除旧 refreshToken 的 Redis 键")
        void rotatesAndRevokesOldRefreshToken() {
            LoginUser user = loginUser(false);
            String oldRt = signToken(SECRET, user, new Date(System.currentTimeMillis() + 600_000));
            when(redisService.getCacheObject(refreshKey(oldRt))).thenReturn(user);

            Token rotated = tokenUtil.refreshToken(oldRt);

            assertThat(rotated.getAccessToken()).isNotBlank();
            assertThat(rotated.getRefreshToken()).isNotBlank();
            assertThat(rotated.getRefreshToken()).isNotEqualTo(oldRt);
            verify(redisService).deleteObject(refreshKey(oldRt));
        }

        @Test
        @DisplayName("refreshToken 验签失败时抛 TokenException，不碰 Redis")
        void throwsWhenTokenInvalid() {
            String forged = signToken("other-secret", loginUser(false),
                    new Date(System.currentTimeMillis() + 600_000));

            assertThatThrownBy(() -> tokenUtil.refreshToken(forged))
                    .isInstanceOf(TokenException.class)
                    .hasMessageContaining("refreshToken过期");

            verify(redisService, never()).deleteObject(anyString());
        }

        @Test
        @DisplayName("token 本身合法但 Redis 里已不存在（已被轮换/登出）时抛 TokenException")
        void throwsWhenAlreadyRevokedInRedis() {
            LoginUser user = loginUser(false);
            String oldRt = signToken(SECRET, user, new Date(System.currentTimeMillis() + 600_000));
            when(redisService.getCacheObject(refreshKey(oldRt))).thenReturn(null);

            assertThatThrownBy(() -> tokenUtil.refreshToken(oldRt))
                    .isInstanceOf(TokenException.class)
                    .hasMessageContaining("refreshToken过期");

            verify(redisService, never()).setCacheObject(anyString(), any(), anyLong(), any());
        }
    }

    @Nested
    @DisplayName("logout（单会话登出，必须幂等）")
    class Logout {

        @Test
        @DisplayName("同时删除 accessToken 与 refreshToken 两个 Redis 键")
        void deletesBothKeys() {
            LoginUser user = loginUser(false);
            long future = System.currentTimeMillis() + 600_000;
            String at = signToken(SECRET, user, new Date(future));
            String rt = signToken(SECRET, user, new Date(future + 1000));

            tokenUtil.logout(at, rt);

            verify(redisService).deleteObject(accessKey(at));
            verify(redisService).deleteObject(refreshKey(rt));
        }

        @Test
        @DisplayName("refreshToken 缺省时只删 accessToken 键")
        void deletesOnlyAccessKeyWhenRefreshTokenMissing() {
            LoginUser user = loginUser(false);
            String at = signToken(SECRET, user, new Date(System.currentTimeMillis() + 600_000));

            tokenUtil.logout(at, null);

            verify(redisService).deleteObject(accessKey(at));
            // 只应发生这一次交互——refresh 键不该被碰
            verifyNoMoreInteractions(redisService);
        }

        @Test
        @DisplayName("token 已过期 / 非法时静默成功，不删任何键（幂等）")
        void silentlyIgnoresInvalidTokens() {
            String expired = signToken(SECRET, loginUser(false),
                    new Date(System.currentTimeMillis() - 60_000));

            tokenUtil.logout(expired, "garbage");

            verify(redisService, never()).deleteObject(anyString());
        }

        @ParameterizedTest(name = "logout([{0}], null) 不做任何事")
        @NullSource
        @ValueSource(strings = {""})
        @DisplayName("accessToken 为空时不触碰 Redis")
        void doesNothingForBlankAccessToken(String blank) {
            tokenUtil.logout(blank, null);

            verifyNoInteractions(redisService);
        }
    }

    @Nested
    @DisplayName("removeTokens（多端全部登出）")
    class RemoveTokens {

        @Test
        @DisplayName("按用户名前缀批量删除 access 与 refresh 两组键")
        void deletesBothPrefixes() {
            tokenUtil.removeTokens(USERNAME);

            verify(redisService).deleteObjects(CachePrefixEnum.ACCESS_TOKEN.getPrefix(USERNAME));
            verify(redisService).deleteObjects(CachePrefixEnum.REFRESH_TOKEN.getPrefix(USERNAME));
        }
    }

    @Nested
    @DisplayName("getLoginUser（当前上下文用户校验）")
    class GetCurrentLoginUser {

        @Test
        @DisplayName("上下文有合法 token 且 Redis 命中时返回用户")
        void returnsUserWhenContextTokenValid() {
            LoginUser user = loginUser(false);
            String at = signToken(SECRET, user, new Date(System.currentTimeMillis() + 600_000));
            when(accessTokenProvider.getAccessToken()).thenReturn(at);
            when(redisService.getCacheObject(accessKey(at))).thenReturn(user);

            assertThat(tokenUtil.getLoginUser()).isSameAs(user);
        }

        @Test
        @DisplayName("上下文无 token 时抛 TokenException")
        void throwsWhenNoTokenInContext() {
            when(accessTokenProvider.getAccessToken()).thenReturn(null);

            assertThatThrownBy(() -> tokenUtil.getLoginUser())
                    .isInstanceOf(TokenException.class);
        }

        @Test
        @DisplayName("token 合法但 Redis 已失效时抛 TokenException")
        void throwsWhenRedisMiss() {
            LoginUser user = loginUser(false);
            String at = signToken(SECRET, user, new Date(System.currentTimeMillis() + 600_000));
            when(accessTokenProvider.getAccessToken()).thenReturn(at);
            when(redisService.getCacheObject(accessKey(at))).thenReturn(null);

            assertThatThrownBy(() -> tokenUtil.getLoginUser())
                    .isInstanceOf(TokenException.class);
        }

        @Test
        @DisplayName("缓存里的用户缺 sysUser 时抛 TokenException，避免下游 NPE")
        void throwsWhenCachedUserHasNoSysUser() {
            LoginUser user = loginUser(false);
            String at = signToken(SECRET, user, new Date(System.currentTimeMillis() + 600_000));

            LoginUser broken = new LoginUser();
            broken.setUserId(42L);
            broken.setUsername(USERNAME);
            broken.setSysUser(null);

            when(accessTokenProvider.getAccessToken()).thenReturn(at);
            when(redisService.getCacheObject(accessKey(at))).thenReturn(broken);

            assertThatThrownBy(() -> tokenUtil.getLoginUser())
                    .isInstanceOf(TokenException.class);
        }

        @Test
        @DisplayName("缓存里的用户缺 userId 时抛 TokenException")
        void throwsWhenCachedUserHasNoUserId() {
            LoginUser user = loginUser(false);
            String at = signToken(SECRET, user, new Date(System.currentTimeMillis() + 600_000));

            LoginUser broken = new LoginUser();
            broken.setUsername(USERNAME);
            broken.setUserId(null);

            when(accessTokenProvider.getAccessToken()).thenReturn(at);
            when(redisService.getCacheObject(accessKey(at))).thenReturn(broken);

            assertThatThrownBy(() -> tokenUtil.getLoginUser())
                    .isInstanceOf(TokenException.class);
        }
    }
}
