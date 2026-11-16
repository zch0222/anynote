package com.anynote.file.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.file.service.FileService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.ByteArrayInputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 内部文件内容流式读取端点单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class InternalFileControllerTest {

    /** 预览签名端点保留内部鉴权并返回资料访问地址。 */
    @Test
    void documentPreviewRequiresInnerAuth() throws Exception {
        var url = com.anynote.file.api.model.bo.ObjectURL.builder().url("http://localhost/doc.pdf").build();
        when(fileService.getDocPreviewUrl(9L)).thenReturn(url);
        assertThat(new InternalFileController(fileService).docPreviewUrl(9L).getData()).isSameAs(url);
        Method method = InternalFileController.class.getMethod("docPreviewUrl", Long.class);
        assertThat(method.getAnnotation(InnerAuth.class)).isNotNull();
    }

    @Mock
    private FileService fileService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new InternalFileController(fileService)).build();
    }

    /**
     * 合法对象名返回二进制流内容，非法参数在写入响应流前抛出对应业务异常。
     */
    @Test
    void streamsContentAndValidatesInnerAuth() throws Exception {
        byte[] pdfBytes = "%PDF-1.4\nhello".getBytes(StandardCharsets.UTF_8);
        when(fileService.openContentStream("doc/1/a.pdf")).thenReturn(new ByteArrayInputStream(pdfBytes));

        MvcResult result = mockMvc.perform(get("/internal/v1/files/content")
                        .param("objectName", "doc/1/a.pdf"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_OCTET_STREAM))
                .andExpect(content().bytes(pdfBytes));

        when(fileService.openContentStream(null))
                .thenThrow(new BusinessException("对象名称不能为空", ResCode.USER_REQUEST_PARAM_ERROR));
        assertThatThrownBy(() -> new InternalFileController(fileService).content(null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("对象名称不能为空");

        Method method = InternalFileController.class.getMethod("content", String.class);
        InnerAuth innerAuth = method.getAnnotation(InnerAuth.class);
        assertThat(innerAuth).isNotNull();
        assertThat(innerAuth.isUser()).isFalse();
    }
}
