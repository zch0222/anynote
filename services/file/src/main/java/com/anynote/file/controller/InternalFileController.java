package com.anynote.file.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.file.service.FileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;

/**
 * 内部文件内容流式读取端点。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "内部文件读取", description = "供检索与索引管线使用的内部流式文件读取端点")
@RestController
@RequestMapping("/internal/v1/files")
public class InternalFileController {

    private final FileService fileService;

    /**
     * 构造内部文件读取端点。
     *
     * @param fileService 文件服务
     */
    public InternalFileController(FileService fileService) {
        this.fileService = fileService;
    }

    /**
     * 按对象名称流式读取文件内容。
     *
     * @param objectName 对象名称
     * @return 文件字节流响应
     */
    @InnerAuth
    @Operation(summary = "流式读取文件内容", description = "按对象名称打开并流式返回原始文件字节流")
    @GetMapping(value = "/content", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> content(
            @Parameter(description = "对象名称")
            @RequestParam(value = "objectName", required = false) String objectName) {
        InputStream stream = fileService.openContentStream(objectName);
        StreamingResponseBody body = outputStream -> {
            try (InputStream input = stream) {
                input.transferTo(outputStream);
            }
        };
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(body);
    }
}
