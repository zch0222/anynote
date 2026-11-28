package com.anynote.system.api.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * 管理员重置用户密码请求
 *
 * @author 称霸幼儿园
 */
@Schema(description = "管理员重置用户密码请求")
@Data
public class AdminResetPasswordDTO {

    @Schema(description = "新密码", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotBlank(message = "新密码不能为空")
    @Pattern(regexp = "^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])[\\x21-\\x7E]{8,15}$",
            message = "密码必须是8到15位，且包含大写字母、小写字母和数字，可包含特殊字符（不含空格）")
    private String newPassword;
}
