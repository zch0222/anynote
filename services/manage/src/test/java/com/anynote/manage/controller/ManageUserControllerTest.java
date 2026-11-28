package com.anynote.manage.controller;

import com.anynote.core.constant.Constants;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.manage.service.ManageUserService;
import com.anynote.system.api.model.dto.AdminResetPasswordDTO;
import com.anynote.system.api.model.dto.UpdateSuperAdminDTO;
import com.anynote.system.api.model.vo.ManageUserVO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 管理端用户控制器单测：确认端点参数透传与统一响应包装。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ManageUserControllerTest {

    @Mock
    private ManageUserService manageUserService;

    @InjectMocks
    private ManageUserController manageUserController;

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
    @DisplayName("用户列表按页码、容量与关键字透传")
    void getUserListDelegates() {
        ManageUserVO vo = new ManageUserVO();
        vo.setUserId(1L);
        PageBean<ManageUserVO> page = PageBean.<ManageUserVO>builder()
                .rows(List.of(vo))
                .total(1L)
                .current(1)
                .pages(1)
                .build();
        when(manageUserService.getUserList(1, 20, "test")).thenReturn(page);

        ResData<PageBean<ManageUserVO>> result = manageUserController.getUserList(1, 20, "test");

        assertEquals(ResData.SUCCESS, result.getCode());
        assertSame(page, result.getData());
    }

    @Test
    @DisplayName("用户详情按用户id透传")
    void getSysUserInfoByIdDelegates() {
        ManageUserVO vo = new ManageUserVO();
        vo.setUserId(1L);
        when(manageUserService.getSysUserInfoById(1L)).thenReturn(vo);

        ResData<ManageUserVO> result = manageUserController.getSysUserInfoById(1L);

        assertEquals(ResData.SUCCESS, result.getCode());
        assertSame(vo, result.getData());
    }

    @Test
    @DisplayName("重置密码返回业务结果")
    void resetPasswordDelegates() {
        AdminResetPasswordDTO dto = resetDTO();
        when(manageUserService.resetPassword(1L, dto)).thenReturn(Constants.SUCCESS_RES);

        ResData<String> result = manageUserController.resetPassword(1L, dto);

        assertEquals(Constants.SUCCESS_RES, result.getData());
        verify(manageUserService).resetPassword(1L, dto);
    }

    @Test
    @DisplayName("设置超级管理员返回业务结果")
    void updateSuperAdminDelegates() {
        UpdateSuperAdminDTO dto = superAdminDTO(true);
        when(manageUserService.updateSuperAdmin(1L, dto)).thenReturn(Constants.SUCCESS_RES);

        ResData<String> result = manageUserController.updateSuperAdmin(1L, dto);

        assertEquals(Constants.SUCCESS_RES, result.getData());
        verify(manageUserService).updateSuperAdmin(1L, dto);
    }

    @Test
    @DisplayName("停用与启用账号委托服务并返回成功")
    void banAndUnbanDelegate() {
        ResData<String> banned = manageUserController.banUser(1L);
        ResData<String> unbanned = manageUserController.unBanUser(1L);

        assertEquals(Constants.SUCCESS_RES, banned.getData());
        assertEquals(Constants.SUCCESS_RES, unbanned.getData());
        verify(manageUserService).banUser(1L);
        verify(manageUserService).unBanUser(1L);
    }
}
