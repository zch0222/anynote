package com.anynote.system.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import org.springframework.lang.Nullable;

/**
 * 当前登录用户更新自己的资料
 *
 * <p>PUT 语义是**整体替换**这四个字段：前端每次都把四个字段全部带上，因此不存在
 * 「没传就不改」的歧义。{@code email} / {@code phoneNumber} 的 {@code ""} 与 {@code null}
 * 都表示清空，落库写成空串（与 {@code sys_user} 的列默认值一致）。</p>
 *
 * <p>请求体里没有 userId：身份一律从登录态取，从契约上杜绝改别人资料。</p>
 *
 * @author 称霸幼儿园
 */
@Schema(description = "更新当前登录用户的个人资料")
@Data
public class UpdateMyProfileDTO {

    @Schema(description = "昵称", requiredMode = Schema.RequiredMode.REQUIRED, maxLength = 30)
    @NotBlank(message = "昵称不能为空")
    @Size(max = 30, message = "昵称长度不能超过30位")
    private String nickname;

    @Schema(description = "性别 0男 1女 2未知（前端显示为「未设置」）",
            requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0", maximum = "2")
    @NotNull(message = "性别不能为空")
    @Min(value = 0, message = "性别取值只能是0男 1女 2未知")
    @Max(value = 2, message = "性别取值只能是0男 1女 2未知")
    private Integer sex;

    @Schema(description = "邮箱；null 或空串都表示清空", maxLength = 50)
    @Nullable
    @Email(message = "邮箱格式不正确")
    @Size(max = 50, message = "邮箱长度不能超过50位")
    private String email;

    @Schema(description = "手机号；null 或空串都表示清空，非空时必须是 11 位且以 1 开头")
    @Nullable
    // 方案写的是 ^1\d{10}$，「非空时」才校验；空串是「清空」的合法取值，
    // 因此这里用交替分支把空串一并放行，其余取值仍必须严格匹配手机号格式。
    @Pattern(regexp = "^$|^1\\d{10}$", message = "手机号格式不正确")
    private String phoneNumber;
}
