package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.LogicalModelConfigMapper;
import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.dto.EmbeddingModelConfigUpdateDTO;
import com.anynote.ai.model.po.LogicalModelConfigPO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.EmbeddingModelConfigVO;
import com.anynote.ai.properties.ModelCatalogProperties;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Date;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 运行时 Embedding 模型配置服务单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class LogicalModelServiceImplTest {

    @Mock
    private LogicalModelConfigMapper logicalModelConfigMapper;

    @Mock
    private ModelProviderMapper modelProviderMapper;

    private ModelCatalogProperties properties;
    private LogicalModelServiceImpl service;

    @BeforeEach
    void setUp() {
        properties = new ModelCatalogProperties();
        service = new LogicalModelServiceImpl(logicalModelConfigMapper, modelProviderMapper, properties);
    }

    /**
     * 数据库暂无记录时回落到 Nacos 静态配置或默认关闭态；数据库记录优先级更高。
     */
    @Test
    @DisplayName("未持久化配置时读取 Nacos 回落配置，持久化后优先返回数据库记录")
    void readsDatabaseOverrideOrNacosFallback() {
        ModelCatalogProperties.LogicalModel fallback = new ModelCatalogProperties.LogicalModel();
        fallback.setProvider("openai");
        fallback.setModel("text-embedding-3-small");
        fallback.setDimensions(1536);
        properties.setLogical(Map.of("embedding", fallback));

        when(logicalModelConfigMapper.selectByLogicalName("embedding")).thenReturn(null);
        EmbeddingModelConfigVO fromNacos = service.getEmbeddingConfig();
        assertTrue(fromNacos.getEnabled());
        assertEquals("openai", fromNacos.getProviderKey());
        assertEquals("text-embedding-3-small", fromNacos.getModel());
        assertEquals(1536, fromNacos.getDimensions());
        assertEquals(0L, fromNacos.getVersion());

        when(logicalModelConfigMapper.selectByLogicalName("embedding")).thenReturn(LogicalModelConfigPO.builder()
                .logicalName("embedding")
                .providerKey("qwen")
                .modelName("text-embedding-v3")
                .dimensions(1024)
                .enabled(0)
                .version(2L)
                .updateTime(new Date(1000L))
                .build());
        EmbeddingModelConfigVO fromDb = service.getEmbeddingConfig();
        assertFalse(fromDb.getEnabled());
        assertEquals("qwen", fromDb.getProviderKey());
        assertEquals("text-embedding-v3", fromDb.getModel());
        assertEquals(1024, fromDb.getDimensions());
        assertEquals(2L, fromDb.getVersion());
    }

    /**
     * 启用向量索引时校验供应商存在、启用、允许数据出境及维度范围；支持手工输入未列在 models 的模型名。
     */
    @Test
    @DisplayName("保存启用配置时校验出境权限与维度并支持手工输入模型名")
    void validatesEgressEnabledAndDimensions() {
        EmbeddingModelConfigUpdateDTO badDims = updateDto("openai", "text-embedding-3-small", 2049, true);
        BusinessException dimsError = assertThrows(BusinessException.class,
                () -> service.updateEmbeddingConfig(badDims, 1L));
        assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, dimsError.getErrorCode());
        assertEquals("向量维度必须在 1 到 2048 之间", dimsError.getErrorMessage());

        when(modelProviderMapper.selectByProviderKey("missing")).thenReturn(null);
        BusinessException missingError = assertThrows(BusinessException.class,
                () -> service.updateEmbeddingConfig(updateDto("missing", "m", 1024, true), 1L));
        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, missingError.getErrorCode());
        assertEquals("所选模型供应商不存在", missingError.getErrorMessage());

        when(modelProviderMapper.selectByProviderKey("disabled")).thenReturn(provider("disabled", 0, 1));
        BusinessException disabledError = assertThrows(BusinessException.class,
                () -> service.updateEmbeddingConfig(updateDto("disabled", "m", 1024, true), 1L));
        assertEquals(ResCode.BUSINESS_ERROR, disabledError.getErrorCode());
        assertEquals("所选模型供应商已停用", disabledError.getErrorMessage());

        when(modelProviderMapper.selectByProviderKey("no_egress")).thenReturn(provider("no_egress", 1, 0));
        BusinessException egressError = assertThrows(BusinessException.class,
                () -> service.updateEmbeddingConfig(updateDto("no_egress", "m", 1024, true), 1L));
        assertEquals(ResCode.BUSINESS_ERROR, egressError.getErrorCode());
        assertEquals("所选供应商未允许数据出境，无法用于知识向量索引", egressError.getErrorMessage());

        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(provider("openai", 1, 1));
        BusinessException emptyModelError = assertThrows(BusinessException.class,
                () -> service.updateEmbeddingConfig(updateDto("openai", "   ", null, true), 1L));
        assertEquals("请选择 Embedding 模型", emptyModelError.getErrorMessage());

        when(logicalModelConfigMapper.selectByLogicalName("embedding")).thenReturn(null);
        EmbeddingModelConfigVO created = service.updateEmbeddingConfig(
                updateDto("openai", "custom-embed-model", 1024, true), 7L);
        ArgumentCaptor<LogicalModelConfigPO> captor = ArgumentCaptor.forClass(LogicalModelConfigPO.class);
        verify(logicalModelConfigMapper).insert(captor.capture());
        assertEquals("custom-embed-model", captor.getValue().getModelName());
        assertEquals(1024, captor.getValue().getDimensions());
        assertEquals(1L, captor.getValue().getVersion());
        assertEquals("custom-embed-model", created.getModel());
    }

    /**
     * 关闭向量索引时允许停用且递增版本号；已存在记录执行 update 并递增版本。
     */
    @Test
    @DisplayName("更新已有绑定记录时递增版本且允许关闭向量索引")
    void updatesExistingBindingAndSupportsDisabling() {
        when(logicalModelConfigMapper.selectByLogicalName("embedding")).thenReturn(LogicalModelConfigPO.builder()
                .id(5L)
                .logicalName("embedding")
                .providerKey("openai")
                .modelName("text-embedding-3-small")
                .dimensions(1536)
                .enabled(1)
                .version(2L)
                .build());
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(provider("openai", 1, 0));

        EmbeddingModelConfigVO updated = service.updateEmbeddingConfig(
                updateDto("openai", "text-embedding-3-small", null, false), 9L);
        verify(logicalModelConfigMapper, never()).insert(any(LogicalModelConfigPO.class));
        verify(logicalModelConfigMapper).updateById(any(LogicalModelConfigPO.class));
        assertFalse(updated.getEnabled());
        assertNull(updated.getDimensions());
        assertEquals(3L, updated.getVersion());
    }

    private EmbeddingModelConfigUpdateDTO updateDto(String providerKey, String model,
                                                    Integer dimensions, Boolean enabled) {
        EmbeddingModelConfigUpdateDTO dto = new EmbeddingModelConfigUpdateDTO();
        dto.setProviderKey(providerKey);
        dto.setModel(model);
        dto.setDimensions(dimensions);
        dto.setEnabled(enabled);
        return dto;
    }

    private ModelProviderPO provider(String key, int enabled, int dataEgressAllowed) {
        return ModelProviderPO.builder()
                .providerKey(key)
                .displayName(key)
                .protocol("openai_compatible")
                .baseUrl("https://api.example.com/v1")
                .enabled(enabled)
                .dataEgressAllowed(dataEgressAllowed)
                .version(1L)
                .build();
    }
}
