package com.anynote.manage.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.utils.RemoteResDataUtil;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.manage.service.ManageUserService;
import com.anynote.system.api.RemoteUserService;
import com.anynote.system.api.model.dto.AdminResetPasswordDTO;
import com.anynote.system.api.model.dto.UpdateSuperAdminDTO;
import com.anynote.system.api.model.vo.ManageUserVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import jakarta.annotation.Resource;

/**
 * 管理端用户服务实现
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class ManageUserServiceImpl implements ManageUserService {

    @Resource
    private RemoteUserService remoteUserService;

    @Resource
    private TokenUtil tokenUtil;

    @Override
    public PageBean<ManageUserVO> getUserList(Integer pageNum, Integer pageSize, String username) {
        ResData<PageBean<ManageUserVO>> resData =
                remoteUserService.getManageUserList(pageNum, pageSize, username);
        return RemoteResDataUtil.getResData(resData, "获取用户列表失败");
    }

    @Override
    public ManageUserVO getSysUserInfoById(Long userId) {
        ResData<ManageUserVO> resData = remoteUserService.getManageUserById(userId);
        return RemoteResDataUtil.getResData(resData, "获取用户信息失败");
    }

    @Override
    public String resetPassword(Long userId, AdminResetPasswordDTO adminResetPasswordDTO) {
        checkNotSelf(userId, "不能重置自己的密码");
        ResData<String> resData = remoteUserService.resetPasswordByAdmin(userId, adminResetPasswordDTO);
        return RemoteResDataUtil.getResData(resData, "重置密码失败，请稍后重试");
    }

    @Override
    public String updateSuperAdmin(Long userId, UpdateSuperAdminDTO updateSuperAdminDTO) {
        if (!Boolean.TRUE.equals(updateSuperAdminDTO.getEnabled())) {
            checkNotSelf(userId, "不能取消自己的超级管理员身份");
        }
        ResData<String> resData = remoteUserService.updateSuperAdmin(userId, updateSuperAdminDTO);
        String errorMessage = Boolean.TRUE.equals(updateSuperAdminDTO.getEnabled())
                ? "设置超级管理员失败，请稍后重试"
                : "取消超级管理员失败，请稍后重试";
        return RemoteResDataUtil.getResData(resData, errorMessage);
    }

    @Override
    public void banUser(Long userId) {
        checkNotSelf(userId, "不能停用自己的账号");
        RemoteResDataUtil.getResData(remoteUserService.banUser(userId), "停用账号失败，请稍后重试");
    }

    @Override
    public void unBanUser(Long userId) {
        RemoteResDataUtil.getResData(remoteUserService.unBanUser(userId), "启用账号失败，请稍后重试");
    }

    /**
     * 校验目标用户不是当前登录用户
     *
     * @param userId 目标用户id
     * @param message 命中时的业务错误文案
     */
    private void checkNotSelf(Long userId, String message) {
        Long currentUserId = tokenUtil.getLoginUser().getUserId();
        if (currentUserId.equals(userId)) {
            throw new BusinessException(message);
        }
    }
}
