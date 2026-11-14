package com.anynote.notify.handler;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.auth.InnerAuthException;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.notify.constant.NotifyErrorConstants;
import com.anynote.notify.controller.InternalNoticeController;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 内部通知接口局部异常处理器。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@RestControllerAdvice(assignableTypes = InternalNoticeController.class)
public class InternalNoticeExceptionHandler {

    /**
     * 处理内部调用鉴权失败异常。
     *
     * @param e 内部认证异常
     * @return 统一错误响应
     */
    @ExceptionHandler(InnerAuthException.class)
    public ResData<Void> handleInnerAuthException(InnerAuthException e) {
        log.warn("内部通知接口鉴权失败: {}", e.getErrorMessage());
        return ResData.error(e.getErrorCode(), e.getErrorMessage());
    }

    /**
     * 处理业务校验异常。
     *
     * @param e 业务异常
     * @return 统一错误响应
     */
    @ExceptionHandler(BusinessException.class)
    public ResData<Void> handleBusinessException(BusinessException e) {
        log.warn("内部通知接口业务异常: {}", e.getErrorMessage());
        return ResData.error(e.getErrorCode(), e.getErrorMessage());
    }

    /**
     * 处理请求体解析失败。
     *
     * @param e 请求体解析异常
     * @return 统一错误响应
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResData<Void> handleHttpMessageNotReadableException(HttpMessageNotReadableException e) {
        log.warn("内部通知接口请求体不可读: {}", e.getMessage());
        return ResData.error(ResCode.USER_REQUEST_PARAM_ERROR, NotifyErrorConstants.INVALID_QUERY_PARAM);
    }

    /**
     * 处理参数约束校验失败。
     *
     * @param e 约束异常
     * @return 统一错误响应
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResData<Void> handleConstraintViolationException(ConstraintViolationException e) {
        String message = e.getConstraintViolations().isEmpty()
                ? NotifyErrorConstants.INVALID_QUERY_PARAM
                : e.getConstraintViolations().iterator().next().getMessage();
        return ResData.error(ResCode.USER_REQUEST_PARAM_ERROR, message);
    }

    /**
     * 处理方法参数校验失败。
     *
     * @param e 参数异常
     * @return 统一错误响应
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResData<Void> handleMethodArgumentNotValidException(MethodArgumentNotValidException e) {
        String message = e.getFieldErrors().isEmpty()
                ? NotifyErrorConstants.INVALID_QUERY_PARAM
                : e.getFieldErrors().get(0).getDefaultMessage();
        return ResData.error(ResCode.USER_REQUEST_PARAM_ERROR, message);
    }

    /**
     * 处理参数绑定异常。
     *
     * @param e 绑定异常
     * @return 统一错误响应
     */
    @ExceptionHandler(BindException.class)
    public ResData<Void> handleBindException(BindException e) {
        String message = e.getFieldErrors().isEmpty()
                ? NotifyErrorConstants.INVALID_QUERY_PARAM
                : e.getFieldErrors().get(0).getDefaultMessage();
        return ResData.error(ResCode.USER_REQUEST_PARAM_ERROR, message);
    }

    /**
     * 兜底未知异常。
     *
     * @param e 未知异常
     * @return 统一错误响应
     */
    @ExceptionHandler(Exception.class)
    public ResData<Void> handleException(Exception e) {
        log.error("内部通知接口发生未知异常", e);
        return ResUtil.error(ResCode.BUSINESS_ERROR, "未知错误，请联系管理员");
    }
}
