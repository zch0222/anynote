package com.anynote.ai.controller;

import com.anynote.ai.model.dto.ModelProviderUpsertDTO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
import com.anynote.ai.properties.ModelCatalogProperties;
import com.anynote.ai.service.ModelProviderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@link ModelProviderController} 的纯单测：使用 standalone MockMvc，不启动 Spring 容器。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class ModelProviderControllerTest {

    @Mock
    private ModelProviderService modelProviderService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mockMvc = MockMvcBuilders.standaloneSetup(new ModelProviderController(modelProviderService))
                .setValidator(validator)
                .build();
    }

    /**
     * 构造一个包含单个供应商与一条逻辑映射的快照。
     *
     * @return 快照
     */
    private ModelProviderSnapshotVO snapshotVO() {
        ModelProviderSnapshotVO.ProviderVO provider = ModelProviderSnapshotVO.ProviderVO.builder()
                .providerKey("openai")
                .displayName("OpenAI")
                .protocol("openai_compatible")
                .baseUrl("https://api.openai.com/v1")
                .apiKey("sk-plain")
                .models(List.of("gpt-4o"))
                .dataEgressAllowed(true)
                .enabled(true)
                .build();
        ModelCatalogProperties.LogicalModel logicalModel = new ModelCatalogProperties.LogicalModel();
        logicalModel.setProvider("openai");
        logicalModel.setModel("gpt-4o");
        Map<String, ModelCatalogProperties.LogicalModel> logicalModels = new LinkedHashMap<>();
        logicalModels.put("fast", logicalModel);
        return ModelProviderSnapshotVO.builder()
                .version("3:1")
                .providers(List.of(provider))
                .logicalModels(logicalModels)
                .build();
    }

    @Test
    @DisplayName("GET snapshot 返回成功信封、版本、供应商与逻辑映射")
    void snapshotShouldReturnSuccessEnvelope() throws Exception {
        when(modelProviderService.snapshot()).thenReturn(snapshotVO());

        mockMvc.perform(get("/internal/v1/model-providers/snapshot"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data.version").value("3:1"))
                .andExpect(jsonPath("$.data.providers[0].providerKey").value("openai"))
                .andExpect(jsonPath("$.data.providers[0].apiKey").value("sk-plain"))
                .andExpect(jsonPath("$.data.providers[0].dataEgressAllowed").value(true))
                .andExpect(jsonPath("$.data.providers[0].models[0]").value("gpt-4o"))
                .andExpect(jsonPath("$.data.logicalModels.fast.provider").value("openai"))
                .andExpect(jsonPath("$.data.logicalModels.fast.model").value("gpt-4o"));
    }

    @Test
    @DisplayName("POST 新增/更新供应商返回新快照版本号")
    void upsertShouldReturnNewSnapshotVersion() throws Exception {
        when(modelProviderService.upsert(any(ModelProviderUpsertDTO.class))).thenReturn("7:2");

        mockMvc.perform(post("/internal/v1/model-providers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey": "openai",
                                  "displayName": "OpenAI",
                                  "baseUrl": "https://api.openai.com/v1",
                                  "apiKey": "sk-plain",
                                  "models": ["gpt-4o"],
                                  "dataEgressAllowed": true,
                                  "enabled": true
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data").value("7:2"));

        ArgumentCaptor<ModelProviderUpsertDTO> captor = ArgumentCaptor.forClass(ModelProviderUpsertDTO.class);
        verify(modelProviderService).upsert(captor.capture());
        assertEquals("openai", captor.getValue().getProviderKey());
        assertEquals("sk-plain", captor.getValue().getApiKey());
        assertTrue(captor.getValue().getDataEgressAllowed());
    }

    @Test
    @DisplayName("POST 缺少必填字段返回参数错误且不调用服务")
    void upsertShouldRejectMissingRequiredFields() throws Exception {
        mockMvc.perform(post("/internal/v1/model-providers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey": "",
                                  "displayName": "",
                                  "baseUrl": "",
                                  "apiKey": ""
                                }
                                """))
                .andExpect(status().isBadRequest());

        verify(modelProviderService, never()).upsert(any());
    }

    @Test
    @DisplayName("DELETE 命中记录返回 SUCCESS")
    void deleteShouldReturnSuccessWhenProviderDeleted() throws Exception {
        when(modelProviderService.delete("openai")).thenReturn(true);

        mockMvc.perform(delete("/internal/v1/model-providers/openai"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data").value("SUCCESS"));

        verify(modelProviderService).delete("openai");
    }

    @Test
    @DisplayName("DELETE 未命中记录返回 A0404")
    void deleteShouldReturnNotFoundWhenProviderMissing() throws Exception {
        when(modelProviderService.delete("missing")).thenReturn(false);

        mockMvc.perform(delete("/internal/v1/model-providers/missing"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("A0404"));
    }
}
