package com.anynote.common.security.aspect;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.common.security.condition.SpringMvcCondition;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.exception.auth.InnerAuthException;
import com.anynote.core.utils.HmacUtils;
import com.anynote.core.utils.ServletUtils;
import com.anynote.core.utils.StringUtils;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.context.annotation.Conditional;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 内部服务调用验证（Spring MVC）
 *
 * @author 称霸幼儿园
 */
@Aspect
@Component
@Conditional(SpringMvcCondition.class)
@Order(0)
public class InnerAuthAspect {

    @Before("@annotation(innerAuth)")
    public void doBefore(JoinPoint joinPoint, InnerAuth innerAuth) {
        String source = ServletUtils.getRequest().getHeader(SecurityConstants.FROM_SOURCE);
        if (!StringUtils.equals(SecurityConstants.INNER, source)) {
            throw new InnerAuthException("没有内部访问权限，不允许访问");
        }

        String timestamp = ServletUtils.getRequest().getHeader(SecurityConstants.INTERNAL_TIMESTAMP);
        String sign = ServletUtils.getRequest().getHeader(SecurityConstants.INTERNAL_SIGN);
        if (!HmacUtils.verify(SecurityConstants.INTERNAL_SECRET, timestamp, sign)) {
            throw new InnerAuthException("内部调用签名验证失败");
        }

        if (innerAuth.isUser()) {
            String accessToken = ServletUtils.getRequest().getHeader(SecurityConstants.ACCESS_TOKEN);
            if (StringUtils.isEmpty(accessToken)) {
                throw new InnerAuthException("没有设置用户信息，不允许访问");
            }
        }
    }
}
