package com.anynote.system.api;

import com.anynote.core.constant.ServiceNameConstants;
import com.anynote.core.web.model.bo.CreateResEntity;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.factory.RemoteUserFallbackFactory;
import com.anynote.system.api.model.bo.KnowledgeBaseImportUser;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.dto.AdminResetPasswordDTO;
import com.anynote.system.api.model.dto.BanUserDTO;
import com.anynote.system.api.model.dto.CreateUserDTO;
import com.anynote.system.api.model.dto.KnowledgeBaseUserImportDTO;
import com.anynote.system.api.model.dto.UnBanUserDTO;
import com.anynote.system.api.model.dto.UpdateSuperAdminDTO;
import com.anynote.system.api.model.po.SysUser;
import com.anynote.system.api.model.vo.KnowledgeBaseUserVO;
import com.anynote.system.api.model.vo.ManageUserVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 用户服务远程调用
 *
 * @author 称霸幼儿园
 */
@FeignClient(contextId = "remoteUserService",
        value = ServiceNameConstants.SYSTEM_SERVICE,
        fallbackFactory = RemoteUserFallbackFactory.class)
public interface RemoteUserService {

    @GetMapping("user/info/{username}")
    public ResData<LoginUser> getUserInfo(@PathVariable("username") String username);

    @PostMapping("user/bases/import")
    public ResData<KnowledgeBaseUserImportDTO> importKnowledgeBaseUser(@Valid @RequestBody KnowledgeBaseUserImportDTO
                                                                                      knowledgeBaseUserImportDTO);


    @GetMapping("user/bases")
    public ResData<PageBean<KnowledgeBaseUserVO>> getKnowledgeBaseUsers(@RequestParam("knowledgeBaseId") Long knowledgeBaseId,
                                                                        @RequestParam("page") Integer page,
                                                                        @RequestParam("pageSize") Integer pageSize,
                                                                        @RequestParam("username") String username);

    @GetMapping("user/{userId}")
    public ResData<SysUser> getSysUserById(@PathVariable("userId") @NotNull(message = "用户id不能为空") Long userId);

    @PutMapping("user/{userId}")
    public ResData<Integer> updateSysUser(@PathVariable("userId") @NotNull(message = "用户id不能为空") Long userId,
                                          @RequestBody SysUser sysUser);

    @GetMapping("user/{userId}/info")
    public ResData<SysUser> getSysUserInfoById(@PathVariable("userId") @NotNull(message = "用户id不能为空") Long userId);

    /**
     * 超级管理员获取用户列表
     * @param pageNum 页码
     * @param pageSize 页面容量
     * @param username 用户名关键字
     * @return 用户分页数据
     */
    @GetMapping("user/list")
    public ResData<PageBean<ManageUserVO>> getManageUserList(@RequestParam("pageNum") Integer pageNum,
                                                             @RequestParam("pageSize") Integer pageSize,
                                                             @RequestParam(value = "username", required = false) String username);

    /**
     * 超级管理员获取用户详情
     * @param userId 用户id
     * @return 用户详情
     */
    @GetMapping("user/{userId}/manage")
    public ResData<ManageUserVO> getManageUserById(@PathVariable("userId") Long userId);

    /**
     * 超级管理员重置用户密码
     * @param userId 用户id
     * @param adminResetPasswordDTO 新密码
     * @return 操作结果
     */
    @PutMapping("user/{userId}/password")
    public ResData<String> resetPasswordByAdmin(@PathVariable("userId") Long userId,
                                                @RequestBody @Valid AdminResetPasswordDTO adminResetPasswordDTO);

    /**
     * 超级管理员设置或取消用户超级管理员身份
     * @param userId 用户id
     * @param updateSuperAdminDTO 超级管理员状态
     * @return 操作结果
     */
    @PutMapping("user/{userId}/super-admin")
    public ResData<String> updateSuperAdmin(@PathVariable("userId") Long userId,
                                            @RequestBody @Valid UpdateSuperAdminDTO updateSuperAdminDTO);

    @PostMapping("user")
    public ResData<CreateResEntity> createUser(@RequestBody @Valid CreateUserDTO createUserDTO);

    @PostMapping("user/{userId}/ban")
    public ResData<String> banUser(@PathVariable("userId") Long userId);

    @PostMapping("user/{userId}/unban")
    public ResData<String> unBanUser(@PathVariable("userId") Long userId);
}
