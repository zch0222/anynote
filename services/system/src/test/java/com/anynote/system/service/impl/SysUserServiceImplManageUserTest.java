package com.anynote.system.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.common.security.utils.SecurityUtils;
import com.anynote.core.constant.Constants;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.system.api.model.dto.AdminResetPasswordDTO;
import com.anynote.system.api.model.dto.UpdateSuperAdminDTO;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import com.anynote.system.api.model.vo.ManageUserVO;
import com.anynote.system.mapper.SysUserMapper;
import com.anynote.system.service.SysRoleService;
import com.github.pagehelper.PageHelper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 管理端用户服务单测：列表、重置密码、设置/取消超级管理员。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SysUserServiceImplManageUserTest {

    private static final long USER_ID = 100L;
    private static final long ADMIN_ROLE_ID = 1L;
    private static final long MEMBER_ROLE_ID = 4L;

    @Mock
    private SysUserMapper sysUserMapper;

    @Mock
    private SysRoleService sysRoleService;

    @Mock
    private TokenUtil tokenUtil;

    private SysUserServiceImpl sysUserService;

    @BeforeEach
    void setUp() {
        sysUserService = new SysUserServiceImpl();
        ReflectionTestUtils.setField(sysUserService, "baseMapper", sysUserMapper);
        ReflectionTestUtils.setField(sysUserService, "sysRoleService", sysRoleService);
        ReflectionTestUtils.setField(sysUserService, "tokenUtil", tokenUtil);
    }

    @AfterEach
    void clearPage() {
        PageHelper.clearPage();
    }

    private static SysUser user() {
        SysUser sysUser = new SysUser();
        sysUser.setId(USER_ID);
        sysUser.setUsername("tester01");
        sysUser.setDeleted(0);
        return sysUser;
    }

    private static SysRole role(Long id, String roleKey) {
        SysRole role = new SysRole();
        role.setId(id);
        role.setRoleKey(roleKey);
        return role;
    }

    private static AdminResetPasswordDTO resetDTO(String password) {
        AdminResetPasswordDTO dto = new AdminResetPasswordDTO();
        dto.setNewPassword(password);
        return dto;
    }

    private static UpdateSuperAdminDTO superAdminDTO(boolean enabled) {
        UpdateSuperAdminDTO dto = new UpdateSuperAdminDTO();
        dto.setEnabled(enabled);
        return dto;
    }

    @Test
    @DisplayName("分页查询用户列表返回映射后的行")
    void getManageUserListReturnsRows() {
        ManageUserVO vo = new ManageUserVO();
        vo.setUserId(USER_ID);
        vo.setUsername("tester01");
        when(sysUserMapper.selectManageUserList(null, "test")).thenReturn(List.of(vo));

        PageBean<ManageUserVO> page = sysUserService.getManageUserList(2, 20, "test");

        assertEquals(2, page.getCurrent());
        assertEquals(1, page.getRows().size());
        assertEquals("tester01", page.getRows().get(0).getUsername());
    }

    @Test
    @DisplayName("用户详情不存在时抛出业务异常")
    void getManageUserByIdRejectsMissingUser() {
        when(sysUserMapper.selectManageUserList(USER_ID, null)).thenReturn(Collections.emptyList());

        BusinessException exception = assertThrows(BusinessException.class,
                () -> sysUserService.getManageUserById(USER_ID));
        assertEquals("用户不存在", exception.getErrorMessage());
    }

    @Test
    @DisplayName("重置密码写入加密密码并注销目标用户全部会话")
    void resetPasswordByAdminEncryptsAndRevokesTokens() {
        when(sysUserMapper.selectById(USER_ID)).thenReturn(user());
        when(sysUserMapper.updateById(any(SysUser.class))).thenReturn(1);

        String result = sysUserService.resetPasswordByAdmin(USER_ID, resetDTO("Abcdef1*"));

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(sysUserMapper).updateById(captor.capture());
        assertTrue(SecurityUtils.matchesPassword("Abcdef1*", captor.getValue().getPassword()));
        verify(tokenUtil).removeTokens("tester01");
        assertEquals(Constants.SUCCESS_RES, result);
    }

    @Test
    @DisplayName("重置密码时用户不存在抛出业务异常")
    void resetPasswordByAdminRejectsMissingUser() {
        when(sysUserMapper.selectById(USER_ID)).thenReturn(null);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> sysUserService.resetPasswordByAdmin(USER_ID, resetDTO("Abcdef1*")));
        assertEquals("用户不存在", exception.getErrorMessage());
        verify(sysUserMapper, never()).updateById(any(SysUser.class));
    }

    @Test
    @DisplayName("设置超级管理员替换用户角色并注销会话")
    void updateSuperAdminGrantsAdminRole() {
        when(sysUserMapper.selectById(USER_ID)).thenReturn(user());
        when(sysRoleService.getOne(any())).thenReturn(role(ADMIN_ROLE_ID, "ADMIN_X"));
        when(sysUserMapper.deleteUserRolesByUserId(USER_ID)).thenReturn(1);
        when(sysUserMapper.insertUserRole(USER_ID, ADMIN_ROLE_ID)).thenReturn(1);

        String result = sysUserService.updateSuperAdmin(USER_ID, superAdminDTO(true));

        verify(sysUserMapper).deleteUserRolesByUserId(USER_ID);
        verify(sysUserMapper).insertUserRole(USER_ID, ADMIN_ROLE_ID);
        verify(tokenUtil).removeTokens("tester01");
        assertEquals(Constants.SUCCESS_RES, result);
    }

    @Test
    @DisplayName("取消超级管理员回退为普通成员并注销会话")
    void updateSuperAdminRevokesAdminRole() {
        when(sysUserMapper.selectById(USER_ID)).thenReturn(user());
        when(sysRoleService.getOne(any()))
                .thenReturn(role(ADMIN_ROLE_ID, "ADMIN_X"))
                .thenReturn(role(MEMBER_ROLE_ID, "MEMBER"));
        when(sysRoleService.selectRoleKeysByUserId(USER_ID)).thenReturn("ADMIN_X");
        when(sysUserMapper.deleteUserRolesByUserId(USER_ID)).thenReturn(1);
        when(sysUserMapper.insertUserRole(USER_ID, MEMBER_ROLE_ID)).thenReturn(1);

        String result = sysUserService.updateSuperAdmin(USER_ID, superAdminDTO(false));

        verify(sysUserMapper).deleteUserRolesByUserId(USER_ID);
        verify(sysUserMapper).insertUserRole(USER_ID, MEMBER_ROLE_ID);
        verify(tokenUtil).removeTokens("tester01");
        assertEquals(Constants.SUCCESS_RES, result);
    }

    @Test
    @DisplayName("取消非超级管理员的身份被拒绝")
    void updateSuperAdminRejectsNonAdmin() {
        when(sysUserMapper.selectById(USER_ID)).thenReturn(user());
        when(sysRoleService.getOne(any())).thenReturn(role(ADMIN_ROLE_ID, "ADMIN_X"));
        when(sysRoleService.selectRoleKeysByUserId(USER_ID)).thenReturn("MEMBER");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> sysUserService.updateSuperAdmin(USER_ID, superAdminDTO(false)));
        assertEquals("该用户不是超级管理员", exception.getErrorMessage());
        verify(sysUserMapper, never()).deleteUserRolesByUserId(anyLong());
    }

    @Test
    @DisplayName("角色不存在时拒绝修改")
    void updateSuperAdminRejectsMissingRole() {
        when(sysUserMapper.selectById(USER_ID)).thenReturn(user());
        when(sysRoleService.getOne(any())).thenReturn(null);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> sysUserService.updateSuperAdmin(USER_ID, superAdminDTO(true)));
        assertEquals("角色不存在", exception.getErrorMessage());
    }
}
