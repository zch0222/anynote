package com.anynote.common.security.aspect;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.condition.SpringWebfluxCondition;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.exception.auth.InnerAuthException;
import com.anynote.core.utils.HmacUtils;
import com.anynote.core.utils.StringUtils;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.context.annotation.Conditional;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/**
 * 内部服务调用验证（Spring WebFlux）
 * 使用 @Around 从 Reactor 上下文读取由 ContextWebFilter 存入的请求头。
 * @author 称霸幼儿园
 */
@Aspect
@Component
@Conditional(SpringWebfluxCondition.class)
@Order(0)
public class InnerAuthWebfluxAspect {

    @Around("@annotation(innerAuth)")
    public Object doAround(ProceedingJoinPoint joinPoint, InnerAuth innerAuth) {
        return Mono.deferContextual(ctx -> {
            String source = ctx.getOrDefault(SecurityConstants.FROM_SOURCE, "");
            if (!StringUtils.equals(SecurityConstants.INNER, source)) {
                return Mono.error(new InnerAuthException("没有内部访问权限，不允许访问"));
            }

            String timestamp = ctx.getOrDefault(SecurityConstants.INTERNAL_TIMESTAMP, "");
            String sign = ctx.getOrDefault(SecurityConstants.INTERNAL_SIGN, "");
            if (!HmacUtils.verify(SecurityConstants.INTERNAL_SECRET, timestamp, sign)) {
                return Mono.error(new InnerAuthException("内部调用签名验证失败"));
            }

            if (innerAuth.isUser()) {
                String accessToken = ctx.getOrDefault(SecurityConstants.ACCESS_TOKEN, "");
                if (StringUtils.isEmpty(accessToken)) {
                    return Mono.error(new InnerAuthException("没有设置用户信息，不允许访问"));
                }
            }

            try {
                Object result = joinPoint.proceed();
                return result == null ? Mono.empty() : Mono.just(result);
            } catch (Throwable e) {
                return Mono.error(e);
            }
        });
    }
}
