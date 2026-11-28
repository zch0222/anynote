package com.anynote.manage.controller;

import com.anynote.core.constant.Constants;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.manage.service.ManageUserService;
import com.anynote.system.api.model.dto.AdminResetPasswordDTO;
import com.anynote.system.api.model.dto.UpdateSuperAdminDTO;
import com.anynote.system.api.model.vo.ManageUserVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.annotation.Resource;

/**
 * 管理端用户管理接口
 *
 * @author 称霸幼儿园
 */
@Tag(name = "管理-用户", description = "后台用户管理接口")
@RestController
@RequestMapping("/v1/admin/users")
@Validated
public class ManageUserController {

    @Resource
    private ManageUserService manageUserService;

    /**
     * 分页查询用户列表
     *
     * @param pageNum 页码，从 1 起
     * @param pageSize 每页条数
     * @param username 用户名关键字
     * @return 用户分页数据
     */
    @Operation(summary = "查询用户列表", description = "按用户名关键字模糊查询")
    @GetMapping
    public ResData<PageBean<ManageUserVO>> getUserList(
            @Parameter(description = "页码，从 1 起") @RequestParam(defaultValue = "1") Integer pageNum,
            @Parameter(description = "每页条数") @RequestParam(defaultValue = "20") Integer pageSize,
            @Parameter(description = "用户名关键字") @RequestParam(required = false) String username) {
        return ResUtil.success(manageUserService.getUserList(pageNum, pageSize, username));
    }

    /**
     * 查询用户详情
     *
     * @param userId 用户id
     * @return 用户详情
     */
    @Operation(summary = "查询用户详情")
    @GetMapping("{userId}")
    public ResData<ManageUserVO> getSysUserInfoById(
            @Parameter(description = "用户id") @PathVariable("userId") @NotNull(message = "用户id不能为空") Long userId) {
        return ResUtil.success(manageUserService.getSysUserInfoById(userId));
    }

    /**
     * 重置用户密码
     *
     * @param userId 用户id
     * @param adminResetPasswordDTO 新密码
     * @return 操作结果
     */
    @Operation(summary = "重置用户密码", description = "重置后该用户全部登录会话失效")
    @PutMapping("{userId}/password")
    public ResData<String> resetPassword(
            @Parameter(description = "用户id") @PathVariable("userId") @NotNull(message = "用户id不能为空") Long userId,
            @Valid @RequestBody AdminResetPasswordDTO adminResetPasswordDTO) {
        return ResUtil.success(manageUserService.resetPassword(userId, adminResetPasswordDTO));
    }

    /**
     * 设置或取消超级管理员
     *
     * @param userId 用户id
     * @param updateSuperAdminDTO 超级管理员状态
     * @return 操作结果
     */
    @Operation(summary = "设置或取消超级管理员", description = "取消后该用户回退为普通成员")
    @PutMapping("{userId}/super-admin")
    public ResData<String> updateSuperAdmin(
            @Parameter(description = "用户id") @PathVariable("userId") @NotNull(message = "用户id不能为空") Long userId,
            @Valid @RequestBody UpdateSuperAdminDTO updateSuperAdminDTO) {
        return ResUtil.success(manageUserService.updateSuperAdmin(userId, updateSuperAdminDTO));
    }

    /**
     * 停用用户账号
     *
     * @param userId 用户id
     * @return 操作结果
     */
    @Operation(summary = "停用用户账号", description = "停用后该用户无法登录，现有登录会话立即失效")
    @PostMapping("{userId}/ban")
    public ResData<String> banUser(
            @Parameter(description = "用户id") @PathVariable("userId") @NotNull(message = "用户id不能为空") Long userId) {
        manageUserService.banUser(userId);
        return ResUtil.success(Constants.SUCCESS_RES);
    }

    /**
     * 启用用户账号
     *
     * @param userId 用户id
     * @return 操作结果
     */
    @Operation(summary = "启用用户账号")
    @PostMapping("{userId}/unban")
    public ResData<String> unBanUser(
            @Parameter(description = "用户id") @PathVariable("userId") @NotNull(message = "用户id不能为空") Long userId) {
        manageUserService.unBanUser(userId);
        return ResUtil.success(Constants.SUCCESS_RES);
    }
}
