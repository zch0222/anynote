package com.anynote.manage.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.RemoteUserService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.dto.AdminResetPasswordDTO;
import com.anynote.system.api.model.dto.UpdateSuperAdminDTO;
import com.anynote.system.api.model.vo.ManageUserVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 管理端用户服务实现单测：自我保护与远程结果映射。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ManageUserServiceImplTest {

    private static final long USER_ID = 100L;
    private static final long OTHER_USER_ID = 101L;

    @Mock
    private RemoteUserService remoteUserService;

    @Mock
    private TokenUtil tokenUtil;

    private ManageUserServiceImpl manageUserService;

    @BeforeEach
    void setUp() {
        manageUserService = new ManageUserServiceImpl();
        ReflectionTestUtils.setField(manageUserService, "remoteUserService", remoteUserService);
        ReflectionTestUtils.setField(manageUserService, "tokenUtil", tokenUtil);
    }

    private void loginAs(long userId) {
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(userId);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    private static AdminResetPasswordDTO resetDTO() {
        AdminResetPasswordDTO dto = new AdminResetPasswordDTO();
        dto.setNewPassword("Abcdef1*");
        return dto;
    }

    private static UpdateSuperAdminDTO superAdminDTO(boolean enabled) {
        UpdateSuperAdminDTO dto = new UpdateSuperAdminDTO();
        dto.setEnabled(enabled);
        return dto;
    }

    @Test
    @DisplayName("用户列表透传远程分页数据")
    void getUserListReturnsRemotePage() {
        ManageUserVO vo = new ManageUserVO();
        vo.setUserId(USER_ID);
        PageBean<ManageUserVO> page = PageBean.<ManageUserVO>builder()
                .rows(List.of(vo))
                .total(1L)
                .current(1)
                .pages(1)
                .build();
        when(remoteUserService.getManageUserList(1, 20, "test")).thenReturn(ResData.success(page));

        PageBean<ManageUserVO> result = manageUserService.getUserList(1, 20, "test");

        assertEquals(1, result.getRows().size());
        assertEquals(USER_ID, result.getRows().get(0).getUserId());
    }

    @Test
    @DisplayName("不能重置自己的密码")
    void resetPasswordRejectsSelf() {
        loginAs(USER_ID);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> manageUserService.resetPassword(USER_ID, resetDTO()));
        assertEquals("不能重置自己的密码", exception.getErrorMessage());
    }

    @Test
    @DisplayName("重置他人密码调用远程接口")
    void resetPasswordDelegates() {
        loginAs(USER_ID);
        when(remoteUserService.resetPasswordByAdmin(eq(OTHER_USER_ID), any()))
                .thenReturn(ResData.success("操作成功"));

        String result = manageUserService.resetPassword(OTHER_USER_ID, resetDTO());

        verify(remoteUserService).resetPasswordByAdmin(eq(OTHER_USER_ID), any());
        assertEquals("操作成功", result);
    }

    @Test
    @DisplayName("重置密码远程失败时使用确认文案")
    void resetPasswordMapsRemoteFailure() {
        loginAs(USER_ID);
        when(remoteUserService.resetPasswordByAdmin(eq(OTHER_USER_ID), any()))
                .thenReturn(ResData.error(ResCode.BUSINESS_ERROR));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> manageUserService.resetPassword(OTHER_USER_ID, resetDTO()));
        assertEquals("重置密码失败，请稍后重试", exception.getErrorMessage());
    }

    @Test
    @DisplayName("不能取消自己的超级管理员身份")
    void updateSuperAdminRejectsSelfCancel() {
        loginAs(USER_ID);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> manageUserService.updateSuperAdmin(USER_ID, superAdminDTO(false)));
        assertEquals("不能取消自己的超级管理员身份", exception.getErrorMessage());
    }

    @Test
    @DisplayName("设自己为超管走幂等重设，调用远程接口")
    void updateSuperAdminAllowsSelfGrant() {
        loginAs(USER_ID);
        when(remoteUserService.updateSuperAdmin(eq(USER_ID), any()))
                .thenReturn(ResData.success("操作成功"));

        String result = manageUserService.updateSuperAdmin(USER_ID, superAdminDTO(true));

        verify(remoteUserService).updateSuperAdmin(eq(USER_ID), any());
        assertEquals("操作成功", result);
    }

    @Test
    @DisplayName("取消超管远程失败时使用取消文案")
    void updateSuperAdminMapsCancelFailure() {
        loginAs(USER_ID);
        when(remoteUserService.updateSuperAdmin(eq(OTHER_USER_ID), any()))
                .thenReturn(ResData.error(ResCode.BUSINESS_ERROR));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> manageUserService.updateSuperAdmin(OTHER_USER_ID, superAdminDTO(false)));
        assertEquals("取消超级管理员失败，请稍后重试", exception.getErrorMessage());
    }

    @Test
    @DisplayName("不能停用自己的账号")
    void banUserRejectsSelf() {
        loginAs(USER_ID);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> manageUserService.banUser(USER_ID));
        assertEquals("不能停用自己的账号", exception.getErrorMessage());
    }

    @Test
    @DisplayName("停用他人账号调用远程接口")
    void banUserDelegates() {
        loginAs(USER_ID);
        when(remoteUserService.banUser(OTHER_USER_ID)).thenReturn(ResData.success("操作成功"));

        manageUserService.banUser(OTHER_USER_ID);

        verify(remoteUserService).banUser(OTHER_USER_ID);
    }

    @Test
    @DisplayName("启用账号调用远程接口")
    void unBanUserDelegates() {
        when(remoteUserService.unBanUser(OTHER_USER_ID)).thenReturn(ResData.success("操作成功"));

        manageUserService.unBanUser(OTHER_USER_ID);

        verify(remoteUserService).unBanUser(OTHER_USER_ID);
    }
}
