package com.anynote.ai.controller;

import com.anynote.ai.model.vo.RetrievalSettingVO;
import com.anynote.ai.security.SystemAdminGuard;
import com.anynote.ai.service.RetrievalSettingService;
import com.anynote.ai.service.impl.RetrievalSettingServiceImpl;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.system.api.model.bo.LoginUser;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 检索参数管理端点的 standalone MockMvc 单测。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class RetrievalSettingAdminControllerTest {

    @Mock
    private RetrievalSettingService retrievalSettingService;

    @Mock
    private SystemAdminGuard systemAdminGuard;

    @Mock
    private LoginUser loginUser;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new RetrievalSettingAdminController(retrievalSettingService, systemAdminGuard))
                .setValidator(validator)
                .build();
    }

    /**
     * 查询先做管理员校验并返回当前参数。
     */
    @Test
    void getRequiresAdmin() throws Exception {
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        when(retrievalSettingService.get()).thenReturn(RetrievalSettingServiceImpl.defaults());

        mockMvc.perform(get("/v1/admin/retrieval-settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data.rrfK").value(60))
                .andExpect(jsonPath("$.data.version").value(0));
        verify(systemAdminGuard).requireAdmin();
    }

    /**
     * 更新时把管理员 id 传给服务。
     */
    @Test
    void updatePassesOperator() throws Exception {
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        when(loginUser.getUserId()).thenReturn(5L);
        RetrievalSettingVO saved = RetrievalSettingServiceImpl.defaults().toBuilder().version(1L).build();
        when(retrievalSettingService.update(any(), eq(5L))).thenReturn(saved);

        mockMvc.perform(put("/v1/admin/retrieval-settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(new Gson().toJson(RetrievalSettingServiceImpl.defaults())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(1));
    }

    /**
     * 缺少必填字段时校验失败，不调用服务。
     */
    @Test
    void updateRejectsMissingFields() throws Exception {
        mockMvc.perform(put("/v1/admin/retrieval-settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rrfK\":60}"))
                .andExpect(status().isBadRequest());
        verify(retrievalSettingService, never()).update(any(), any());
    }

    /**
     * 非管理员被准入组件拒绝，服务不被调用。
     */
    @Test
    void nonAdminIsRejected() {
        when(systemAdminGuard.requireAdmin()).thenThrow(new AuthException(SystemAdminGuard.ADMIN_ONLY_MESSAGE,
                ResCode.UNAUTHORIZED_ERROR));
        RetrievalSettingAdminController controller =
                new RetrievalSettingAdminController(retrievalSettingService, systemAdminGuard);

        assertThrows(AuthException.class, controller::getSettings);
        verify(retrievalSettingService, never()).get();
    }
}
