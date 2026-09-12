package com.anynote.file.api.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import jakarta.validation.constraints.NotNull;

@Data
public class OssSliceUploadTaskCreatePublicDTO {

    /**
     * 文件名
     */
    @Schema(description = "文件名")
    @NotNull(message = "文件名称不能为空")
    private String fileName;

    /**
     * 文件哈希
     */
    @Schema(description = "文件哈希，用于秒传与断点续传的去重键")
    @NotNull(message = "文件哈希不能为空")
    private String hash;

    /**
     * 文件大小，单位 MB
     */
    @Schema(description = "文件大小，单位 **MB**（不是字节）。后端据此计算 chunkSize 与总分片数",
            example = "1.5")
    @NotNull(message = "文件大小不能为空")
    private Double fileSize;

    /**
     * contentType
     */
    @Schema(description = "文件 MIME 类型")
    @NotNull(message = "contentType不能为空")
    private String contentType;
}
