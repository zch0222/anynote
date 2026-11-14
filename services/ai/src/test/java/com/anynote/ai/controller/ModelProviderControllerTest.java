package com.anynote.ai.controller;

import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
import com.anynote.ai.properties.ModelCatalogProperties;
import com.anynote.ai.service.ModelProviderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 内部模型供应商快照端点单测。
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
        mockMvc = MockMvcBuilders.standaloneSetup(new ModelProviderController(modelProviderService)).build();
    }

    @Test
    @DisplayName("快照返回供应商、内部 Key 与逻辑映射")
    void snapshotShouldReturnSuccessEnvelope() throws Exception {
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
        when(modelProviderService.snapshot()).thenReturn(ModelProviderSnapshotVO.builder()
                .version("3:1")
                .providers(List.of(provider))
                .logicalModels(logicalModels)
                .build());

        mockMvc.perform(get("/internal/v1/model-providers/snapshot"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data.providers[0].apiKey").value("sk-plain"))
                .andExpect(jsonPath("$.data.logicalModels.fast.model").value("gpt-4o"));
    }
}
