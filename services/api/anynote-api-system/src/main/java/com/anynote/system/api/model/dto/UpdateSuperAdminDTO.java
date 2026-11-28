package com.anynote.system.api.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 设置或取消超级管理员请求
 *
 * @author 称霸幼儿园
 */
@Schema(description = "设置或取消超级管理员请求")
@Data
public class UpdateSuperAdminDTO {

    @Schema(description = "true 设为超级管理员；false 取消超级管理员并回退为普通成员",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "超级管理员状态不能为空")
    private Boolean enabled;
}
