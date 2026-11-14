package com.anynote.note.datascope.aspect;

import com.anynote.common.datascope.constants.PermissionConstants;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.web.model.bo.BaseEntity;
import com.anynote.note.datascope.annotation.RequiresMoocPermissions;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.system.api.model.bo.LoginUser;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.CodeSignature;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.HashMap;

/**
 * 慕课统一权限校验切面。
 *
 * @author 称霸幼儿园
 */
@Aspect
@Component
@Order(1)
public class RequiresMoocPermissionsAspect {

    private final TokenUtil tokenUtil;
    private final KnowledgeAccessService knowledgeAccessService;

    /**
     * 构造慕课权限切面。
     *
     * @param tokenUtil 用户令牌工具
     * @param knowledgeAccessService 知识权限服务
     */
    public RequiresMoocPermissionsAspect(TokenUtil tokenUtil, KnowledgeAccessService knowledgeAccessService) {
        this.tokenUtil = tokenUtil;
        this.knowledgeAccessService = knowledgeAccessService;
    }

    /**
     * 校验当前用户对目标慕课的权限并写入参数上下文。
     *
     * @param joinPoint 切点
     * @param required 权限注解
     */
    @Before("@annotation(required)")
    public void doBefore(JoinPoint joinPoint, RequiresMoocPermissions required) {
        Object queryParam = queryParam(joinPoint, required.queryParamName());
        Long moocId = moocId(queryParam, required.paramIdName());
        LoginUser loginUser = tokenUtil.getLoginUser();
        int permission = knowledgeAccessService.getPermission(loginUser,
                KnowledgeRef.of(KnowledgeEntityType.MOOC, moocId));
        setPermission(queryParam, permission);
        if (permission < required.value().getValue()) {
            throw new AuthException();
        }
    }

    private Object queryParam(JoinPoint joinPoint, String name) {
        String[] names = ((CodeSignature) joinPoint.getSignature()).getParameterNames();
        Object[] args = joinPoint.getArgs();
        for (int i = 0; i < names.length; i++) {
            if (name.equals(names[i])) {
                return args[i];
            }
        }
        throw new BusinessException("未知异常，请联系管理员");
    }

    private Long moocId(Object queryParam, String idName) {
        String getter = "get" + Character.toUpperCase(idName.charAt(0)) + idName.substring(1);
        try {
            return (Long) queryParam.getClass().getMethod(getter).invoke(queryParam);
        } catch (Exception e) {
            throw new BusinessException("未知异常，请联系管理员");
        }
    }

    private void setPermission(Object queryParam, int permission) {
        if (!(queryParam instanceof BaseEntity baseEntity)) {
            return;
        }
        if (baseEntity.getParams() == null) {
            baseEntity.setParams(new HashMap<>());
        }
        baseEntity.getParams().put(PermissionConstants.PERMISSION_CONTEXT_KEY, permission);
    }
}
