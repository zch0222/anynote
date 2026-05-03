package com.anynote.common.security.token;

import com.anynote.core.constant.SecurityConstants;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
public class ServletAccessTokenProvider implements AccessTokenProvider {

    @Override
    public String getAccessToken() {
        if (RequestContextHolder.getRequestAttributes() != null) {
            HttpServletRequest request = ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes()).getRequest();
            return request.getHeader(SecurityConstants.ACCESS_TOKEN);
        }
        return null;
    }
}
