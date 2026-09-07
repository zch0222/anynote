package com.anynote.auth.service.impl;

import com.anynote.common.redis.service.RedisService;
import com.anynote.common.security.utils.SecurityUtils;
import com.anynote.core.constant.CacheConstants;
import com.anynote.core.constant.Constants;
import com.anynote.core.exception.auth.LoginException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.system.api.model.po.SysUser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link PasswordServiceImpl} 纯单元测试。BCrypt 用真实实现（无外部依赖），
 * 只打桩 Redis。重点覆盖连续错误计数与账户锁定这条容易出错的分支。
 */
@ExtendWith(MockitoExtension.class)
class PasswordServiceImplTest {

    private static final String USERNAME = "alice";
    private static final String RAW_PASSWORD = "correct-horse";
    private static final String CACHE_KEY = CacheConstants.PASSWORD_ERROR_COUNT_KEY + USERNAME;

    @Mock
    private RedisService redisService;

    @InjectMocks
    private PasswordServiceImpl passwordService;

    private static SysUser userWithPassword(String rawPassword) {
        SysUser sysUser = new SysUser();
        sysUser.setId(42L);
        sysUser.setUsername(USERNAME);
        sysUser.setPassword(SecurityUtils.encryptPassword(rawPassword));
        return sysUser;
    }

    @Test
    @DisplayName("密码正确且此前无错误记录：直接通过，不写也不删缓存")
    void passesWhenPasswordCorrectAndNoPriorFailures() {
        SysUser sysUser = userWithPassword(RAW_PASSWORD);
        when(redisService.getCacheObject(CACHE_KEY)).thenReturn(null);
        when(redisService.hasKey(CACHE_KEY)).thenReturn(false);

        assertThatCode(() -> passwordService.validate(sysUser, RAW_PASSWORD))
                .doesNotThrowAnyException();

        verify(redisService, never()).setCacheObject(anyString(), any(), any(), any());
        verify(redisService, never()).deleteObject(anyString());
    }

    @Test
    @DisplayName("密码正确且此前有错误记录：清空错误计数（给下次登录一个干净起点）")
    void clearsRetryCountAfterSuccessfulLogin() {
        SysUser sysUser = userWithPassword(RAW_PASSWORD);
        when(redisService.getCacheObject(CACHE_KEY)).thenReturn(3);
        when(redisService.hasKey(CACHE_KEY)).thenReturn(true);

        passwordService.validate(sysUser, RAW_PASSWORD);

        verify(redisService).deleteObject(CACHE_KEY);
    }

    @Test
    @DisplayName("密码错误：抛 LoginException 并把错误次数 +1 写回，带 5 分钟 TTL")
    void incrementsRetryCountOnWrongPassword() {
        SysUser sysUser = userWithPassword(RAW_PASSWORD);
        when(redisService.getCacheObject(CACHE_KEY)).thenReturn(2);

        assertThatThrownBy(() -> passwordService.validate(sysUser, "wrong-password"))
                .isInstanceOf(LoginException.class)
                .extracting(e -> ((LoginException) e).getErrorCode())
                .isEqualTo(ResCode.USER_IDENTITY_VERIFICATION_FAILED);

        verify(redisService).setCacheObject(
                CACHE_KEY, 3, Constants.PASSWORD_ERROR_LACK_TIME, TimeUnit.MINUTES);
    }

    @Test
    @DisplayName("首次输错：计数从 null 起算，写入 1 而不是 NPE")
    void startsCountFromNullWithoutNpe() {
        SysUser sysUser = userWithPassword(RAW_PASSWORD);
        when(redisService.getCacheObject(CACHE_KEY)).thenReturn(null);

        assertThatThrownBy(() -> passwordService.validate(sysUser, "wrong-password"))
                .isInstanceOf(LoginException.class);

        verify(redisService).setCacheObject(
                CACHE_KEY, 1, Constants.PASSWORD_ERROR_LACK_TIME, TimeUnit.MINUTES);
    }

    @ParameterizedTest(name = "已累计 {0} 次错误 → 账户锁定")
    @ValueSource(ints = {5, 6, 99})
    @DisplayName("达到上限后即使密码正确也拒绝，且不再累加计数")
    void locksAccountOnceRetryLimitReached(int retryCount) {
        SysUser sysUser = userWithPassword(RAW_PASSWORD);
        when(redisService.getCacheObject(CACHE_KEY)).thenReturn(retryCount);

        assertThatThrownBy(() -> passwordService.validate(sysUser, RAW_PASSWORD))
                .isInstanceOf(LoginException.class)
                .extracting(e -> ((LoginException) e).getErrorCode())
                .isEqualTo(ResCode.USER_PASSWORD_TRY_ERROR);

        verify(redisService, never()).setCacheObject(anyString(), any(), any(), any());
        verify(redisService, never()).deleteObject(anyString());
    }

    @Test
    @DisplayName("上限前一次（4 次）仍允许尝试，未被提前锁定")
    void stillAllowsAttemptJustBelowLimit() {
        SysUser sysUser = userWithPassword(RAW_PASSWORD);
        when(redisService.getCacheObject(CACHE_KEY)).thenReturn(Constants.PASSWORD_MAX_RETRY_COUNT - 1);
        when(redisService.hasKey(CACHE_KEY)).thenReturn(true);

        assertThatCode(() -> passwordService.validate(sysUser, RAW_PASSWORD))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("错误计数的缓存 key 按用户名隔离，不会串号")
    void cacheKeyIsScopedPerUsername() {
        SysUser other = new SysUser();
        other.setUsername("bob");
        other.setPassword(SecurityUtils.encryptPassword(RAW_PASSWORD));
        String otherKey = CacheConstants.PASSWORD_ERROR_COUNT_KEY + "bob";

        when(redisService.getCacheObject(otherKey)).thenReturn(null);
        when(redisService.hasKey(otherKey)).thenReturn(false);

        passwordService.validate(other, RAW_PASSWORD);

        verify(redisService).getCacheObject(otherKey);
        assertThat(otherKey).isNotEqualTo(CACHE_KEY);
    }
}
