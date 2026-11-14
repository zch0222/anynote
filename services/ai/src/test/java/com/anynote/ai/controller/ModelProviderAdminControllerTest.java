package com.anynote.ai.controller;

import com.anynote.ai.model.dto.ModelProviderCreateDTO;
import com.anynote.ai.model.dto.ModelProviderUpdateDTO;
import com.anynote.ai.model.vo.ModelProviderAdminVO;
import com.anynote.ai.security.SystemAdminGuard;
import com.anynote.ai.service.ModelProviderService;
import com.anynote.system.api.model.bo.LoginUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 管理员模型供应商 CRUD 端点的 standalone MockMvc 单测。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class ModelProviderAdminControllerTest {

    @Mock
    private ModelProviderService modelProviderService;

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
                        new ModelProviderAdminController(modelProviderService, systemAdminGuard))
                .setValidator(validator)
                .build();
    }

    @Test
    @DisplayName("列表与详情先做管理员校验且不返回 Key")
    void listAndGetShouldRequireAdmin() throws Exception {
        ModelProviderAdminVO provider = providerVO();
        when(modelProviderService.list()).thenReturn(List.of(provider));
        when(modelProviderService.get("openai")).thenReturn(provider);
        mockMvc.perform(get("/v1/admin/model-providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].providerKey").value("openai"))
                .andExpect(jsonPath("$.data[0].apiKey").doesNotExist());
        mockMvc.perform(get("/v1/admin/model-providers/openai"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.baseUrl").value("https://api.openai.com/v1"));
        verify(systemAdminGuard, org.mockito.Mockito.times(2)).requireAdmin();
    }

    @Test
    @DisplayName("新增返回非敏感详情并传递管理员 ID")
    void createShouldPassOperator() throws Exception {
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        when(loginUser.getUserId()).thenReturn(42L);
        when(modelProviderService.create(any(ModelProviderCreateDTO.class), eq(42L)))
                .thenReturn(providerVO());
        mockMvc.perform(post("/v1/admin/model-providers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey":"openai",
                                  "displayName":"OpenAI",
                                  "protocol":"openai_compatible",
                                  "baseUrl":"https://api.openai.com/v1",
                                  "apiKey":"sk-plain",
                                  "models":["gpt-4o"],
                                  "dataEgressAllowed":true,
                                  "enabled":true
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.providerKey").value("openai"))
                .andExpect(jsonPath("$.data.apiKey").doesNotExist());
        verify(modelProviderService).create(any(ModelProviderCreateDTO.class), eq(42L));
    }

    @Test
    @DisplayName("整体更新允许空 Key 并使用路径标识")
    void updateShouldAllowBlankApiKey() throws Exception {
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        when(loginUser.getUserId()).thenReturn(42L);
        when(modelProviderService.update(eq("openai"), any(ModelProviderUpdateDTO.class), eq(42L)))
                .thenReturn(providerVO());
        mockMvc.perform(put("/v1/admin/model-providers/openai")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(" ")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(3));
        verify(modelProviderService).update(eq("openai"), any(ModelProviderUpdateDTO.class), eq(42L));
    }

    @Test
    @DisplayName("非法地址与新增空 Key 返回参数错误")
    void invalidInputShouldNotCallService() throws Exception {
        mockMvc.perform(post("/v1/admin/model-providers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey":"openai",
                                  "displayName":"OpenAI",
                                  "baseUrl":"file:///tmp/model",
                                  "apiKey":""
                                }
                                """))
                .andExpect(status().isBadRequest());
        verify(modelProviderService, never()).create(any(), any());
    }

    @Test
    @DisplayName("删除成功返回 SUCCESS")
    void deleteShouldReturnSuccess() throws Exception {
        mockMvc.perform(delete("/v1/admin/model-providers/openai"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value("SUCCESS"));
        verify(systemAdminGuard).requireAdmin();
        verify(modelProviderService).delete("openai");
    }

    private ModelProviderAdminVO providerVO() {
        return ModelProviderAdminVO.builder()
                .providerKey("openai")
                .displayName("OpenAI")
                .protocol("openai_compatible")
                .baseUrl("https://api.openai.com/v1")
                .models(List.of("gpt-4o"))
                .dataEgressAllowed(true)
                .enabled(true)
                .version(3L)
                .build();
    }

    private String updateJson(String apiKey) {
        return """
                {
                  "displayName":"OpenAI",
                  "protocol":"openai_compatible",
                  "baseUrl":"https://api.openai.com/v1",
                  "apiKey":"%s",
                  "models":["gpt-4o"],
                  "dataEgressAllowed":true,
                  "enabled":true
                }
                """.formatted(apiKey);
    }
}
