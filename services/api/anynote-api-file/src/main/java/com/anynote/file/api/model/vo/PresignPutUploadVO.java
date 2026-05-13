package com.anynote.file.api.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 单文件直传 PUT 预签名 URL 响应体。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "单文件直传 PUT 预签名 URL 响应体")
public class PresignPutUploadVO {

    @Schema(description = "对象存储类型（MIN_IO / HUAWEI_OBS）", example = "MIN_IO")
    private String ossType;

    @Schema(description = "客户端 PUT 上传目标 URL；将文件原始字节作为 body 发送", example = "https://minio.example.com/anynote/notes/123/cover.png?...")
    private String uploadUrl;

    @Schema(description = "对象在 bucket 中的规范名称（不含主机），后续读取/记录使用", example = "notes/123/cover.png")
    private String objectName;

    @Schema(description = "签名过期时间（epoch 毫秒）", example = "1715683200000")
    private Long expiresAtMs;
}
