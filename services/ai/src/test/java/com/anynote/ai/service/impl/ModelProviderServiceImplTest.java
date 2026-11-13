package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.dto.ModelProviderUpsertDTO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
import com.anynote.ai.properties.ModelCatalogProperties;
import com.anynote.ai.security.credential.AesGcmCipher;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link ModelProviderServiceImpl} 的纯单测：快照版本与解密、upsert 新增/更新、删除。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class ModelProviderServiceImplTest {

    /** 固定的 32 字节测试主密钥（全 0，仅测试用）。 */
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
     * @param id       主键
     * @param key      供应商标识
     * @param apiKey   明文凭据
     * @param version  版本号
     * @param enabled  是否启用（1 启用 0 停用）
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
                .createBy(0L)
                .updateBy(0L)
                .createTime(new Date())
                .updateTime(new Date())
                .build();
    }

    @Test
    @DisplayName("空表快照：版本 0:0，供应商与映射均为空")
    void snapshotShouldReturnEmptySnapshotWhenTableEmpty() {
        when(modelProviderMapper.selectAll()).thenReturn(Collections.emptyList());

        ModelProviderSnapshotVO snapshot = modelProviderService.snapshot();

        assertEquals("0:0", snapshot.getVersion());
        assertTrue(snapshot.getProviders().isEmpty());
        assertTrue(snapshot.getLogicalModels().isEmpty());
    }

    @Test
    @DisplayName("有数据快照：解密 apiKey、取最大版本、合并 Nacos 映射")
    void snapshotShouldDecryptProvidersAndMergeLogicalModels() {
        modelCatalogProperties.setMappingVersion(7);
        ModelCatalogProperties.LogicalModel logicalModel = new ModelCatalogProperties.LogicalModel();
        logicalModel.setProvider("openai");
        logicalModel.setModel("gpt-4o");
        Map<String, ModelCatalogProperties.LogicalModel> logical = new LinkedHashMap<>();
        logical.put("fast", logicalModel);
        modelCatalogProperties.setLogical(logical);

        ModelProviderPO enabledProvider = providerPO(1L, "openai", "sk-openai", 3L, 1);
        ModelProviderPO disabledProvider = providerPO(2L, "backup", "sk-backup", 9L, 0);
        when(modelProviderMapper.selectAll()).thenReturn(List.of(enabledProvider, disabledProvider));

        ModelProviderSnapshotVO snapshot = modelProviderService.snapshot();

        assertEquals("9:7", snapshot.getVersion());
        assertEquals(2, snapshot.getProviders().size());
        ModelProviderSnapshotVO.ProviderVO first = snapshot.getProviders().get(0);
        assertEquals("openai", first.getProviderKey());
        assertEquals("sk-openai", first.getApiKey());
        assertEquals(List.of("m1", "m2"), first.getModels());
        assertTrue(first.getDataEgressAllowed());
        assertTrue(first.getEnabled());
        assertFalse(snapshot.getProviders().get(1).getEnabled());
        assertEquals("openai", snapshot.getLogicalModels().get("fast").getProvider());
        assertEquals("gpt-4o", snapshot.getLogicalModels().get("fast").getModel());
    }

    @Test
    @DisplayName("upsert 新增：version=1、apiKey 加密落库、可空字段取默认值")
    void upsertShouldInsertNewProviderWithEncryptedApiKey() {
        ModelProviderUpsertDTO dto = new ModelProviderUpsertDTO();
        dto.setProviderKey("openai");
        dto.setDisplayName("OpenAI");
        dto.setBaseUrl("https://api.openai.com/v1");
        dto.setApiKey("sk-plain");
        dto.setModels(List.of("m1", "m2"));

        AtomicReference<ModelProviderPO> inserted = new AtomicReference<>();
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(null);
        when(modelProviderMapper.insert(any(ModelProviderPO.class))).thenAnswer(invocation -> {
            inserted.set(invocation.getArgument(0));
            return 1;
        });
        when(modelProviderMapper.selectAll()).thenAnswer(invocation ->
                inserted.get() == null ? Collections.emptyList() : List.of(inserted.get()));

        String version = modelProviderService.upsert(dto);

        assertEquals("1:0", version);
        assertEquals(1L, inserted.get().getVersion());
        assertEquals("openai_compatible", inserted.get().getProtocol());
        assertEquals("[\"m1\",\"m2\"]", inserted.get().getModelsJson());
        assertEquals(0, inserted.get().getDataEgressAllowed());
        assertEquals(1, inserted.get().getEnabled());
        assertEquals("sk-plain", aesGcmCipher.decrypt(inserted.get().getApiKeyCipher()));
        assertEquals(0L, inserted.get().getCreateBy());
        assertNotNull(inserted.get().getCreateTime());
        verify(modelProviderMapper, never()).updateById(any(ModelProviderPO.class));
    }

    @Test
    @DisplayName("upsert 更新：version+1、保留未传字段、新 apiKey 重新加密")
    void upsertShouldIncrementVersionAndKeepUnspecifiedFields() {
        modelCatalogProperties.setMappingVersion(2);
        ModelProviderPO existing = providerPO(10L, "openai", "sk-old", 4L, 0);
        existing.setModelsJson("[\"old-model\"]");
        existing.setDataEgressAllowed(0);

        ModelProviderUpsertDTO dto = new ModelProviderUpsertDTO();
        dto.setProviderKey("openai");
        dto.setDisplayName("OpenAI-新");
        dto.setBaseUrl("https://api.openai.com/v2");
        dto.setApiKey("sk-new");

        AtomicReference<ModelProviderPO> updated = new AtomicReference<>();
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(existing);
        when(modelProviderMapper.updateById(any(ModelProviderPO.class))).thenAnswer(invocation -> {
            updated.set(invocation.getArgument(0));
            return 1;
        });
        when(modelProviderMapper.selectAll()).thenAnswer(invocation -> List.of(updated.get()));

        String version = modelProviderService.upsert(dto);

        assertEquals("5:2", version);
        assertEquals(10L, updated.get().getId());
        assertEquals(5L, updated.get().getVersion());
        assertEquals("OpenAI-新", updated.get().getDisplayName());
        assertEquals("https://api.openai.com/v2", updated.get().getBaseUrl());
        assertEquals("openai_compatible", updated.get().getProtocol());
        assertEquals("[\"old-model\"]", updated.get().getModelsJson());
        assertEquals(0, updated.get().getDataEgressAllowed());
        assertEquals(0, updated.get().getEnabled());
        assertEquals("sk-new", aesGcmCipher.decrypt(updated.get().getApiKeyCipher()));
        verify(modelProviderMapper, never()).insert(any(ModelProviderPO.class));
    }

    @Test
    @DisplayName("delete 命中记录返回 true")
    void deleteShouldReturnTrueWhenRowDeleted() {
        when(modelProviderMapper.delete(any())).thenReturn(1);

        assertTrue(modelProviderService.delete("openai"));
        verify(modelProviderMapper).delete(any());
    }

    @Test
    @DisplayName("delete 未命中记录返回 false")
    void deleteShouldReturnFalseWhenRowMissing() {
        when(modelProviderMapper.delete(any())).thenReturn(0);

        assertFalse(modelProviderService.delete("missing"));
    }

    @Test
    @DisplayName("delete 空标识直接返回 false 且不访问数据库")
    void deleteShouldReturnFalseWhenProviderKeyBlank() {
        assertFalse(modelProviderService.delete("  "));
        verify(modelProviderMapper, never()).delete(any());
    }
}
