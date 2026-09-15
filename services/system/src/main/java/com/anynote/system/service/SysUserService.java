package com.anynote.system.service;

import com.anynote.core.web.model.bo.PageBean;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.dto.KnowledgeBaseUserImportDTO;
import com.anynote.system.api.model.po.SysUser;
import com.anynote.system.api.model.vo.KnowledgeBaseUserVO;
import com.anynote.system.api.model.bo.SysUserQueryParam;
import com.anynote.system.api.model.dto.CreateUserDTO;
import com.anynote.system.model.dto.ResetPasswordDTO;
import com.anynote.system.model.dto.UpdateMyProfileDTO;
import com.baomidou.mybatisplus.extension.service.IService;

/**
 * 用户服务
 * @author 称霸幼儿园
 */
public interface SysUserService extends IService<SysUser> {

    /**
     * 通过用户名获取用户信息
     * @param username 用户名
     * @return 用户信息
     */
    public LoginUser getUserInfo(String username);

    /**
     * 通过用户名查询用户
     *
     * @param userName 用户名
     * @return 用户对象信息
     */
    public SysUser selectUserByUserName(String userName);


    public Integer associateUserRole(Long userId, Long roleId);

    public KnowledgeBaseUserImportDTO importKnowledgeBaseUser(KnowledgeBaseUserImportDTO knowledgeBaseUserImportDTO);

    public PageBean<KnowledgeBaseUserVO> getKnowledgeBaseUsers(Long knowledgeBaseId, Integer page, Integer pageSize, String username);

    public SysUser getSysUserById(Long userId);


    public Integer updateSysUser(SysUser sysUser);


    /**
     * 获取用户自己的信息
     * @return 获取用户自己的信息
     */
    public SysUser getMyUserInfo();

    /**
     * 当前登录用户更新自己的资料
     *
     * <p>身份从登录态取，请求体里没有 userId；PUT 语义是整体替换四个字段，
     * {@code email} / {@code phoneNumber} 的 null 与空串都写成空串（清空）。</p>
     *
     * @param updateMyProfileDTO 白名单字段（昵称、性别、邮箱、手机号）
     * @return 更新后的资料
     */
    public SysUser updateMyProfile(UpdateMyProfileDTO updateMyProfileDTO);

    public SysUser getPublicUserInfoByUsername(String username);

    public String resetPassword(ResetPasswordDTO resetPasswordDTO);

    /**
     * 超级管理员获取用户列表
     * @param queryParam
     * @return
     */
    public PageBean<SysUser> getManageUserList(SysUserQueryParam queryParam);

    public SysUser getSysUserInfoById(Long userId);

    public Long createUser(CreateUserDTO createUserDTO);

    /**
     * 封禁用户
     * @param userId
     */
    public void banUser(Long userId);

    /**
     * 解封用户
     * @param userId
     */
    public void unbanUser(Long userId);
}
