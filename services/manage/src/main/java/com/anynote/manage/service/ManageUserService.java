package com.anynote.manage.service;

import com.anynote.core.web.model.bo.PageBean;
import com.anynote.system.api.model.dto.AdminResetPasswordDTO;
import com.anynote.system.api.model.dto.UpdateSuperAdminDTO;
import com.anynote.system.api.model.vo.ManageUserVO;

/**
 * 管理端用户服务
 *
 * @author 称霸幼儿园
 */
public interface ManageUserService {

    /**
     * 分页查询用户列表
     *
     * @param pageNum 页码
     * @param pageSize 页面容量
     * @param username 用户名关键字
     * @return 用户分页数据
     */
    public PageBean<ManageUserVO> getUserList(Integer pageNum, Integer pageSize, String username);

    /**
     * 查询用户详情
     *
     * @param userId 用户id
     * @return 用户详情
     */
    public ManageUserVO getSysUserInfoById(Long userId);

    /**
     * 重置用户密码
     *
     * @param userId 用户id
     * @param adminResetPasswordDTO 新密码
     * @return 操作结果
     */
    public String resetPassword(Long userId, AdminResetPasswordDTO adminResetPasswordDTO);

    /**
     * 设置或取消超级管理员
     *
     * @param userId 用户id
     * @param updateSuperAdminDTO 超级管理员状态
     * @return 操作结果
     */
    public String updateSuperAdmin(Long userId, UpdateSuperAdminDTO updateSuperAdminDTO);

    /**
     * 停用用户账号
     *
     * @param userId 用户id
     */
    public void banUser(Long userId);

    /**
     * 启用用户账号
     *
     * @param userId 用户id
     */
    public void unBanUser(Long userId);
}
