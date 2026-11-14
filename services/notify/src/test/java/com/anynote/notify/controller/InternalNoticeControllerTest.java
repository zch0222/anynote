package com.anynote.notify.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.exception.auth.InnerAuthException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.notify.constant.NotifyErrorConstants;
import com.anynote.notify.handler.InternalNoticeExceptionHandler;
import com.anynote.notify.model.dto.KnowledgeNoticeBatchDTO;
import com.anynote.notify.model.dto.KnowledgeNoticeExportDTO;
import com.anynote.notify.model.vo.KnowledgeNoticeBatchVO;
import com.anynote.notify.model.vo.KnowledgeNoticeExportVO;
import com.anynote.notify.service.KnowledgeNoticeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 内部知识库通知控制器与局部异常处理器单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class InternalNoticeControllerTest {

    @Mock
    private KnowledgeNoticeService knowledgeNoticeService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new InternalNoticeController(knowledgeNoticeService))
                .setControllerAdvice(new InternalNoticeExceptionHandler())
                .build();
    }

    /**
     * 导出和批量接口返回统一 ResData，并验证局部异常处理与 @InnerAuth 声明。
     */
    @Test
    void handlesExportBatchAndScopedExceptions() throws Exception {
        when(knowledgeNoticeService.export(any())).thenReturn(
                KnowledgeNoticeExportVO.builder().documents(List.of()).hasMore(false).build());
        mockMvc.perform(post("/internal/v1/notices/export").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data.hasMore").value(false));

        when(knowledgeNoticeService.getBatch(any())).thenReturn(
                KnowledgeNoticeBatchVO.builder().documents(List.of()).missingIds(List.of(99L)).build());
        mockMvc.perform(post("/internal/v1/notices/batch").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[99]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data.missingIds[0]").value(99));

        when(knowledgeNoticeService.export(any())).thenThrow(new InnerAuthException("内部调用签名验证失败"));
        mockMvc.perform(post("/internal/v1/notices/export").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ResCode.UNAUTHORIZED_ERROR.getCode()))
                .andExpect(jsonPath("$.msg").value("内部调用签名验证失败"));

        mockMvc.perform(post("/internal/v1/notices/export").contentType(MediaType.APPLICATION_JSON)
                        .content("{invalid"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ResCode.USER_REQUEST_PARAM_ERROR.getCode()))
                .andExpect(jsonPath("$.msg").value(NotifyErrorConstants.INVALID_QUERY_PARAM));

        Method exportMethod = InternalNoticeController.class.getMethod("export", KnowledgeNoticeExportDTO.class);
        Method batchMethod = InternalNoticeController.class.getMethod("getBatch", KnowledgeNoticeBatchDTO.class);
        assertThat(exportMethod.getAnnotation(InnerAuth.class).isUser()).isFalse();
        assertThat(batchMethod.getAnnotation(InnerAuth.class).isUser()).isFalse();
    }
}
