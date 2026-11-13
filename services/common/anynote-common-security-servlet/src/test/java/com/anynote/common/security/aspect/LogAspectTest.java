package com.anynote.common.security.aspect;

import com.anynote.common.security.token.TokenUtil;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link LogAspect} 单元测试：流式响应不参与响应体序列化。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class LogAspectTest {

    @Mock
    private TokenUtil tokenUtil;

    @Test
    @DisplayName("SseEmitter 返回值原样返回且不抛序列化异常")
    void skipsSerializingStreamingResponse() throws Throwable {
        RequestContextHolder.resetRequestAttributes();
        LogAspect logAspect = new LogAspect();
        ReflectionTestUtils.setField(logAspect, "tokenUtil", tokenUtil);
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        SseEmitter emitter = new SseEmitter();
        when(joinPoint.proceed()).thenReturn(emitter);

        Object result = logAspect.doAround(joinPoint);

        assertThat(result).isSameAs(emitter);
    }
}
