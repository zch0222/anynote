package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 向模型发送的一张资料页面图像元数据，不含图片字节。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "向模型发送的资料页面图像元数据")
public class AgentVisualImageVO {

    @Schema(description = "运行内视觉附件标识")
    private String attachmentId;

    @Schema(description = "资料引用")
    private String ref;

    @Schema(description = "资料标题")
    private String title;

    @Schema(description = "1 起页码")
    private Integer pageNo;

    @Schema(description = "页面证据编号")
    private String evidenceId;

    @Schema(description = "原文件内容版本")
    private String contentVersion;

    @Schema(description = "来源工具")
    private String sourceTool;

    @Schema(description = "来源工具调用标识")
    private String sourceCallId;

    @Schema(description = "图像媒体类型")
    private String mediaType;

    @Schema(description = "图像宽度")
    private Integer width;

    @Schema(description = "图像高度")
    private Integer height;

    @Schema(description = "JPEG 字节数")
    private Long sizeBytes;

    @Schema(description = "实际 JPEG 内容 SHA-256")
    private String sha256;

    @Schema(description = "图像 Token 预算估值")
    private Integer estimatedTokens;
}
