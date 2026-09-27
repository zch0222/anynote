package com.anynote.common.security.properties;

import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.utils.StringUtils;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.util.Arrays;

/**
 * 服务间内部调用的 HMAC 密钥。
 *
 * <p>配置项为 {@code anynote.internal.secret}（也可用环境变量 {@code ANYNOTE_INTERNAL_SECRET}），
 * 由 {@code @InnerAuth} 的校验切面与 Feign 请求拦截器共同读取，签名方与校验方始终用同一个值。
 * 非 Java 的调用方（协同服务）按同一规则签名，必须配置相同的值。</p>
 *
 * <p>未配置时回落到 {@link SecurityConstants#INTERNAL_SECRET}，保证开发环境开箱可用；
 * 该常量随仓库公开，非 dev profile 下回落时启动日志会打 WARN。</p>
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Configuration
@ConfigurationProperties(prefix = "anynote.internal")
public class InternalSecretProperties {

    /** 允许静默回落到默认密钥的 profile。 */
    private static final String DEV_PROFILE = "dev";

    /** 配置的密钥，为空表示使用默认密钥。 */
    private String secret;

    @Autowired(required = false)
    private Environment environment;

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    /**
     * 返回实际用于签名与校验的密钥：配置了就用配置值，否则用默认常量。
     *
     * @return 非空的 HMAC 密钥
     */
    public String resolveSecret() {
        return StringUtils.isNotEmpty(secret) && !secret.isBlank() ? secret.trim() : SecurityConstants.INTERNAL_SECRET;
    }

    /**
     * 是否正在使用随仓库公开的默认密钥。
     *
     * @return 未配置密钥时为 true
     */
    public boolean isUsingDefaultSecret() {
        return SecurityConstants.INTERNAL_SECRET.equals(resolveSecret());
    }

    /**
     * 判断当前 profile 组合下使用默认密钥是否需要告警：只有 dev profile 可以静默回落。
     *
     * @param activeProfiles 当前激活的 profile
     * @return 需要告警时为 true
     */
    boolean shouldWarnDefaultSecret(String[] activeProfiles) {
        if (!isUsingDefaultSecret()) {
            return false;
        }
        return activeProfiles == null || Arrays.stream(activeProfiles).noneMatch(DEV_PROFILE::equals);
    }

    @PostConstruct
    void warnIfDefaultSecret() {
        String[] profiles = environment == null ? new String[0] : environment.getActiveProfiles();
        if (shouldWarnDefaultSecret(profiles)) {
            log.warn("anynote.internal.secret 未配置，内部调用正在使用随仓库公开的默认密钥；"
                    + "请在 Nacos 或环境变量 ANYNOTE_INTERNAL_SECRET 中配置，并与协同服务保持一致");
        }
    }
}
