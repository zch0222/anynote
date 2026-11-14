package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.dto.ModelProviderCreateDTO;
import com.anynote.ai.model.dto.ModelProviderUpdateDTO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.ModelProviderAdminVO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
import com.anynote.ai.properties.ModelCatalogProperties;
import com.anynote.ai.security.credential.AesGcmCipher;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Base64;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

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
 * {@link ModelProviderServiceImpl} 的快照、CRUD 与凭据边界单测。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class ModelProviderServiceImplTest {

    private static final String TEST_MASTER_KEY = Base64.getEncoder().encodeToString(new byte[32]);

    @Mock
    private ModelProviderMapper modelProviderMapper;

    private ModelCatalogProperties modelCatalogProperties;

    private AesGcmCipher aesGcmCipher;

    private ModelProviderServiceImpl modelProviderService;

    @BeforeEach
    void setUp() {
        modelCatalogProperties = new ModelCatalogProperties();
        aesGcmCipher = new AesGcmCipher(() -> TEST_MASTER_KEY);
        modelProviderService = new ModelProviderServiceImpl(modelProviderMapper, modelCatalogProperties,
                aesGcmCipher, new Gson());
    }

    /**
     * 构造一行供应商数据。
     *
     * @param id 主键
     * @param key 供应商标识
     * @param apiKey 明文凭据
     * @param version 版本
     * @param enabled 是否启用
     * @return 持久化对象
     */
    private ModelProviderPO providerPO(Long id, String key, String apiKey, long version, int enabled) {
        return ModelProviderPO.builder()
                .id(id)
                .providerKey(key)
                .displayName("供应商-" + key)
                .protocol("openai_compatible")
                .baseUrl("https://" + key + ".example.com/v1")
                .apiKeyCipher(aesGcmCipher.encrypt(apiKey))
                .modelsJson("[\"m1\",\"m2\"]")
                .dataEgressAllowed(1)
                .enabled(enabled)
                .version(version)
                .createBy(10L)
                .updateBy(10L)
                .createTime(new Date())
                .updateTime(new Date())
                .build();
    }

    @Test
    @DisplayName("空表快照返回 0:0 与空列表")
    void snapshotShouldReturnEmptySnapshotWhenTableEmpty() {
        when(modelProviderMapper.selectAll()).thenReturn(Collections.emptyList());
        ModelProviderSnapshotVO snapshot = modelProviderService.snapshot();
        assertEquals("0:0", snapshot.getVersion());
        assertTrue(snapshot.getProviders().isEmpty());
        assertTrue(snapshot.getLogicalModels().isEmpty());
    }

    @Test
    @DisplayName("内部快照解密凭据并合并逻辑映射")
    void snapshotShouldDecryptProvidersAndMergeLogicalModels() {
        modelCatalogProperties.setMappingVersion(7);
        ModelCatalogProperties.LogicalModel logicalModel = new ModelCatalogProperties.LogicalModel();
        logicalModel.setProvider("openai");
        logicalModel.setModel("gpt-4o");
        Map<String, ModelCatalogProperties.LogicalModel> logical = new LinkedHashMap<>();
        logical.put("fast", logicalModel);
        modelCatalogProperties.setLogical(logical);
        when(modelProviderMapper.selectAll()).thenReturn(List.of(
                providerPO(1L, "openai", "sk-openai", 3L, 1),
                providerPO(2L, "backup", "sk-backup", 9L, 0)));
        ModelProviderSnapshotVO snapshot = modelProviderService.snapshot();
        assertEquals("9:7", snapshot.getVersion());
        assertEquals("sk-openai", snapshot.getProviders().get(0).getApiKey());
        assertFalse(new Gson().toJson(snapshot).contains("sk-openai"));
        assertFalse(snapshot.getProviders().get(1).getEnabled());
        assertEquals("gpt-4o", snapshot.getLogicalModels().get("fast").getModel());
    }

    @Test
    @DisplayName("管理列表不包含 API Key 或密文")
    void listShouldReturnNonSensitiveViews() {
        when(modelProviderMapper.selectAll()).thenReturn(List.of(providerPO(1L, "openai", "sk-secret", 3L, 1)));
        List<ModelProviderAdminVO> result = modelProviderService.list();
        String json = new Gson().toJson(result);
        assertEquals("openai", result.get(0).getProviderKey());
        assertFalse(json.contains("sk-secret"));
        assertFalse(json.contains("apiKey"));
        assertFalse(json.contains("Cipher"));
    }

    @Test
    @DisplayName("新增供应商加密 Key 并记录管理员 ID")
    void createShouldEncryptKeyAndRecordOperator() {
        ModelProviderCreateDTO dto = new ModelProviderCreateDTO();
        dto.setProviderKey("openai");
        dto.setDisplayName("OpenAI");
        dto.setBaseUrl("https://api.openai.com/v1");
        dto.setApiKey("sk-plain");
        dto.setModels(List.of("m1"));
        AtomicReference<ModelProviderPO> inserted = new AtomicReference<>();
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(null);
        when(modelProviderMapper.insert(any(ModelProviderPO.class))).thenAnswer(invocation -> {
            inserted.set(invocation.getArgument(0));
            return 1;
        });
        ModelProviderAdminVO result = modelProviderService.create(dto, 42L);
        assertEquals("sk-plain", aesGcmCipher.decrypt(inserted.get().getApiKeyCipher()));
        assertEquals(42L, inserted.get().getCreateBy());
        assertEquals(1L, inserted.get().getVersion());
        assertEquals("openai", result.getProviderKey());
    }

    @Test
    @DisplayName("新增重复标识返回已确认错误且不写库")
    void createShouldRejectDuplicateProviderKey() {
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(providerPO(1L, "openai", "old", 1L, 1));
        ModelProviderCreateDTO dto = new ModelProviderCreateDTO();
        dto.setProviderKey("openai");
        dto.setDisplayName("OpenAI");
        dto.setBaseUrl("https://api.openai.com/v1");
        dto.setApiKey("sk-plain");
        BusinessException error = assertThrows(BusinessException.class,
                () -> modelProviderService.create(dto, 42L));
        assertEquals("供应商标识已存在", error.getErrorMessage());
        verify(modelProviderMapper, never()).insert(any(ModelProviderPO.class));
    }

    @Test
    @DisplayName("整体更新时空 Key 保留原凭据并递增版本")
    void updateShouldKeepCredentialWhenApiKeyBlank() {
        ModelProviderPO existing = providerPO(10L, "openai", "sk-old", 4L, 0);
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(existing);
        AtomicReference<ModelProviderPO> updated = new AtomicReference<>();
        when(modelProviderMapper.updateById(any(ModelProviderPO.class))).thenAnswer(invocation -> {
            updated.set(invocation.getArgument(0));
            return 1;
        });
        ModelProviderUpdateDTO dto = updateDTO();
        dto.setApiKey(" ");
        ModelProviderAdminVO result = modelProviderService.update("openai", dto, 42L);
        assertNull(updated.get().getApiKeyCipher());
        assertEquals(5L, updated.get().getVersion());
        assertEquals(42L, updated.get().getUpdateBy());
        assertEquals("OpenAI-新", result.getDisplayName());
        assertEquals(List.of("new-model"), result.getModels());
    }

    @Test
    @DisplayName("整体更新传入新 Key 时重新加密")
    void updateShouldReplaceCredentialWhenApiKeyPresent() {
        ModelProviderPO existing = providerPO(10L, "openai", "sk-old", 4L, 1);
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(existing);
        AtomicReference<ModelProviderPO> updated = new AtomicReference<>();
        when(modelProviderMapper.updateById(any(ModelProviderPO.class))).thenAnswer(invocation -> {
            updated.set(invocation.getArgument(0));
            return 1;
        });
        ModelProviderUpdateDTO dto = updateDTO();
        dto.setApiKey("sk-new");
        modelProviderService.update("openai", dto, 42L);
        assertEquals("sk-new", aesGcmCipher.decrypt(updated.get().getApiKeyCipher()));
    }

    @Test
    @DisplayName("查询或删除不存在记录返回统一错误")
    void missingProviderShouldReturnNotFound() {
        when(modelProviderMapper.selectByProviderKey("missing")).thenReturn(null);
        BusinessException getError = assertThrows(BusinessException.class,
                () -> modelProviderService.get("missing"));
        BusinessException deleteError = assertThrows(BusinessException.class,
                () -> modelProviderService.delete("missing"));
        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, getError.getErrorCode());
        assertEquals("模型供应商不存在", deleteError.getErrorMessage());
    }

    @Test
    @DisplayName("删除命中记录按内部主键执行")
    void deleteShouldRemoveExistingProvider() {
        ModelProviderPO existing = providerPO(10L, "openai", "sk-old", 4L, 1);
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(existing);
        when(modelProviderMapper.deleteById(10L)).thenReturn(1);
        modelProviderService.delete("openai");
        verify(modelProviderMapper).deleteById(10L);
    }

    @Test
    @DisplayName("供应商请求 toString 不包含 API Key")
    void dtoToStringShouldExcludeApiKey() {
        ModelProviderCreateDTO create = new ModelProviderCreateDTO();
        create.setApiKey("sk-secret");
        ModelProviderUpdateDTO update = new ModelProviderUpdateDTO();
        update.setApiKey("sk-secret");
        assertFalse(create.toString().contains("sk-secret"));
        assertFalse(update.toString().contains("sk-secret"));
    }

    private ModelProviderUpdateDTO updateDTO() {
        ModelProviderUpdateDTO dto = new ModelProviderUpdateDTO();
        dto.setDisplayName("OpenAI-新");
        dto.setProtocol("openai_compatible");
        dto.setBaseUrl("https://api.openai.com/v2");
        dto.setModels(List.of("new-model"));
        dto.setDataEgressAllowed(false);
        dto.setEnabled(true);
        return dto;
    }
}
