package com.anynote.note.datascope.aspect;

import com.anynote.common.datascope.constants.PermissionConstants;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.note.datascope.annotation.RequiresMoocPermissions;
import com.anynote.note.enums.NotePermissions;
import com.anynote.note.model.bo.MoocQueryParam;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.system.api.model.bo.LoginUser;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.reflect.CodeSignature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 慕课权限切面参数上下文和阈值单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class RequiresMoocPermissionsAspectTest {

    @Mock private TokenUtil tokenUtil;
    @Mock private KnowledgeAccessService accessService;
    @Mock private JoinPoint joinPoint;
    @Mock private CodeSignature signature;
    @Mock private RequiresMoocPermissions annotation;

    private RequiresMoocPermissionsAspect aspect;
    private MoocQueryParam queryParam;

    @BeforeEach
    void setUp() {
        aspect = new RequiresMoocPermissionsAspect(tokenUtil, accessService);
        queryParam = MoocQueryParam.MoocQueryParamBuilder().moocId(3L).build();
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(7L);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
        when(joinPoint.getSignature()).thenReturn(signature);
        when(signature.getParameterNames()).thenReturn(new String[]{"moocQueryParam"});
        when(joinPoint.getArgs()).thenReturn(new Object[]{queryParam});
        when(annotation.queryParamName()).thenReturn("moocQueryParam");
        when(annotation.paramIdName()).thenReturn("moocId");
        when(annotation.value()).thenReturn(NotePermissions.EDIT);
    }

    /**
     * 达到权限阈值时写入通用权限上下文键。
     */
    @Test
    void writesComputedPermission() {
        when(accessService.getPermission(any(), any())).thenReturn(6);

        aspect.doBefore(joinPoint, annotation);

        assertThat(queryParam.getParams()).containsEntry(PermissionConstants.PERMISSION_CONTEXT_KEY, 6);
    }

    /**
     * 低于权限阈值时沿用未授权异常。
     */
    @Test
    void rejectsInsufficientPermission() {
        when(accessService.getPermission(any(), any())).thenReturn(4);

        assertThatThrownBy(() -> aspect.doBefore(joinPoint, annotation))
                .isInstanceOf(AuthException.class);
    }
}
