package com.anynote.auth.model.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * 自助重置密码请求
 *
 * @author 称霸幼儿园
 */
@Data
public class ResetPasswordDTO {

    @NotNull(message = "旧密码不能为空")
    private String oldPassword;

    @NotNull(message = "新密码不能为空")
    @Pattern(regexp = "^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])[\\x21-\\x7E]{8,15}$",
            message = "密码必须是8到15位，且包含大写字母、小写字母和数字，可包含特殊字符（不含空格）")
    private String newPassword;
}
