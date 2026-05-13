package com.anynote.file.api.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 申请对象存储单文件直传 PUT 预签名 URL 的请求体。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "申请对象存储单文件直传 PUT 预签名 URL 请求体")
public class PresignPutUploadDTO {

    @NotBlank(message = "保存目录不能为空")
    @Schema(description = "对象保存目录，如 notes/123/", example = "notes/123/")
    private String path;

    @NotBlank(message = "文件名不能为空")
    @Schema(description = "文件名（不含目录）", example = "cover.png")
    private String fileName;

    @Schema(description = "Content-Type，advisory 字段，部分对象存储会按此校验", example = "image/png")
    private String contentType;

    @Schema(description = "签名过期秒数；不传则使用服务端默认值（通常 3600）", example = "3600")
    private Integer expireSeconds;
}
