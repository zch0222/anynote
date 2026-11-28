package com.anynote.system.api.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Date;

/**
 * 管理端用户列表项
 *
 * @author 称霸幼儿园
 */
@Schema(description = "管理端用户列表项")
@Data
public class ManageUserVO {

    @Schema(description = "用户ID")
    private Long userId;

    @Schema(description = "用户名")
    private String username;

    @Schema(description = "昵称")
    private String nickname;

    @Schema(description = "邮箱")
    private String email;

    @Schema(description = "手机号")
    private String phoneNumber;

    @Schema(description = "账号状态 0正常 1停用")
    private Integer status;

    @Schema(description = "角色ID")
    private Long roleId;

    @Schema(description = "角色名称")
    private String roleName;

    @Schema(description = "角色标识")
    private String roleKey;

    @Schema(description = "最后登录时间")
    private Date loginDate;

    @Schema(description = "注册时间")
    private Date createTime;
}
