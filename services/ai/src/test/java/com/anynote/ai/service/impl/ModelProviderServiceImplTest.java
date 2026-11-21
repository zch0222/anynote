package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.LogicalModelConfigMapper;
import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.po.LogicalModelConfigPO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.ModelProviderAdminVO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
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
import java.util.List;
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
 * {@link ModelProviderServiceImpl} 的快照、CRUD 与凭据边界单测；快照逻辑模型唯一来源是数据库。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class ModelProviderServiceImplTest {

    private static final String TEST_MASTER_KEY = Base64.getEncoder().encodeToString(new byte[32]);

    @Mock
    private ModelProviderMapper modelProviderMapper;

    @Mock
    private LogicalModelConfigMapper logicalModelConfigMapper;

    private AesGcmCipher aesGcmCipher;

    private ModelProviderServiceImpl modelProviderService;

    @BeforeEach
    void setUp() {
        aesGcmCipher = new AesGcmCipher(() -> TEST_MASTER_KEY);
        modelProviderService = new ModelProviderServiceImpl(modelProviderMapper,
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
    @DisplayName("空表快照返回 0 与空列表")
    void snapshotShouldReturnEmptySnapshotWhenTableEmpty() {
        when(modelProviderMapper.selectAll()).thenReturn(Collections.emptyList());
        when(logicalModelConfigMapper.selectAll()).thenReturn(Collections.emptyList());
        ModelProviderSnapshotVO snapshot = withLogicalMapper().snapshot();
        assertEquals("0:0", snapshot.getVersion());
        assertTrue(snapshot.getProviders().isEmpty());
        assertTrue(snapshot.getLogicalModels().isEmpty());
    }

    /**
     * 快照逻辑模型只来自 a_logical_model 全表，带推理配置且版本按各行 version 求和。
     */
    @Test
    @DisplayName("快照逻辑模型来自数据库全表并携带推理配置")
    void snapshotShouldTakeLogicalModelsFromDatabaseOnly() {
        when(modelProviderMapper.selectAll()).thenReturn(List.of(
                providerPO(1L, "openai", "sk-openai", 3L, 1),
                providerPO(2L, "backup", "sk-backup", 9L, 0)));
        when(logicalModelConfigMapper.selectAll()).thenReturn(List.of(
                logicalRow("agent_main", "openai", "gpt-4o", null, "reasoning_content", "empty", 1, 4L),
                logicalRow("embedding", "openai", "text-embedding-3-small", 1024, "none", "none", 1, 2L)));
        ModelProviderSnapshotVO snapshot = withLogicalMapper().snapshot();

        assertEquals("15:0", snapshot.getVersion());
        assertEquals("sk-openai", snapshot.getProviders().get(0).getApiKey());
        assertFalse(new Gson().toJson(snapshot).contains("sk-openai"));
        assertFalse(snapshot.getProviders().get(1).getEnabled());

        ModelProviderSnapshotVO.LogicalModelVO main = snapshot.getLogicalModels().get("agent_main");
        assertEquals("openai", main.getProvider());
        assertEquals("gpt-4o", main.getModel());
        assertTrue(main.getEnabled());
        assertEquals("reasoning_content", main.getReasoningFormat());
        assertEquals("empty", main.getReasoningPassthrough());

        ModelProviderSnapshotVO.LogicalModelVO embedding = snapshot.getLogicalModels().get("embedding");
        assertEquals(1024, embedding.getDimensions());
        assertEquals("none", embedding.getReasoningFormat());
    }

    /**
     * 未注入逻辑模型 Mapper 时快照不含任何逻辑模型（兼容旧构造器）。
     */
    @Test
    @DisplayName("无逻辑模型 Mapper 时快照逻辑模型为空")
    void snapshotWithoutLogicalMapperReturnsEmptyLogicalModels() {
        when(modelProviderMapper.selectAll()).thenReturn(
                List.of(providerPO(1L, "openai", "sk-plain", 2L, 1)));
        ModelProviderSnapshotVO snapshot = modelProviderService.snapshot();
        assertTrue(snapshot.getLogicalModels().isEmpty());
        assertEquals("2:0", snapshot.getVersion());
    }

    @Test
    @DisplayName("管理列表不包含 API Key 或密文")
    void listShouldReturnNonSensitiveViews() {
        when(modelProviderMapper.selectAll()).thenReturn(
                List.of(providerPO(1L, "openai", "sk-secret", 3L, 1)));
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
        com.anynote.ai.model.dto.ModelProviderCreateDTO dto =
                new com.anynote.ai.model.dto.ModelProviderCreateDTO();
        dto.setProviderKey("openai");
        dto.setDisplayName("OpenAI");
        dto.setBaseUrl("https://api.openai.com/v1");
        dto.setApiKey("sk-plain");
        dto.setModels(List.of("m1"));
        dto.setProcessReasoningMaxChars(6000);
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
        assertEquals(6000, inserted.get().getProcessReasoningMaxChars());
        assertEquals("openai", result.getProviderKey());
        assertEquals(6000, result.getProcessReasoningMaxChars());
    }

    @Test
    @DisplayName("新增重复标识返回已确认错误且不写库")
    void createShouldRejectDuplicateProviderKey() {
        when(modelProviderMapper.selectByProviderKey("openai"))
                .thenReturn(providerPO(1L, "openai", "old", 1L, 1));
        com.anynote.ai.model.dto.ModelProviderCreateDTO dto =
                new com.anynote.ai.model.dto.ModelProviderCreateDTO();
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
        com.anynote.ai.model.dto.ModelProviderUpdateDTO dto = updateDTO();
        dto.setApiKey(" ");
        ModelProviderAdminVO result = modelProviderService.update("openai", dto, 42L);
        assertNull(updated.get().getApiKeyCipher());
        assertEquals(5L, updated.get().getVersion());
        assertEquals(42L, updated.get().getUpdateBy());
        assertEquals("OpenAI-新", result.getDisplayName());
        assertEquals(List.of("new-model"), result.getModels());
        assertEquals(9000, updated.get().getProcessReasoningMaxChars());
    }

    @Test
    @DisplayName("按逻辑模型解析绑定的供应商与思考截断字数")
    void resolveLogicalModelReturnsBoundProvider() {
        ModelProviderServiceImpl service = withLogicalMapper();
        ModelProviderPO provider = providerPO(10L, "stepfun", "sk", 1L, 1);
        provider.setProcessReasoningMaxChars(6000);
        when(logicalModelConfigMapper.selectByLogicalName("agent_main"))
                .thenReturn(logicalRow("agent_main", "stepfun", "step-5", null, "none", "none", 1, 1L));
        when(modelProviderMapper.selectByProviderKey("stepfun")).thenReturn(provider);

        com.anynote.ai.model.bo.LogicalModelProviderBO resolved = service.resolveLogicalModel("agent_main");

        assertEquals("stepfun", resolved.getProviderKey());
        assertEquals(6000, resolved.getProcessReasoningMaxChars());
    }

    @Test
    @DisplayName("逻辑模型未绑定或供应商不存在时解析为空")
    void resolveLogicalModelReturnsNullWhenUnbound() {
        ModelProviderServiceImpl service = withLogicalMapper();
        when(logicalModelConfigMapper.selectByLogicalName("fast"))
                .thenReturn(logicalRow("fast", null, null, null, "none", "none", 0, 1L));
        when(logicalModelConfigMapper.selectByLogicalName("agent_main"))
                .thenReturn(logicalRow("agent_main", "gone", "m", null, "none", "none", 1, 1L));
        when(modelProviderMapper.selectByProviderKey("gone")).thenReturn(null);

        assertNull(service.resolveLogicalModel("fast"));
        assertNull(service.resolveLogicalModel("agent_main"));
        assertNull(service.resolveLogicalModel(null));
        assertNull(modelProviderService.resolveLogicalModel("agent_main"));
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
        com.anynote.ai.model.dto.ModelProviderUpdateDTO dto = updateDTO();
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
        com.anynote.ai.model.dto.ModelProviderCreateDTO create =
                new com.anynote.ai.model.dto.ModelProviderCreateDTO();
        create.setApiKey("sk-secret");
        com.anynote.ai.model.dto.ModelProviderUpdateDTO update =
                new com.anynote.ai.model.dto.ModelProviderUpdateDTO();
        update.setApiKey("sk-secret");
        assertFalse(create.toString().contains("sk-secret"));
        assertFalse(update.toString().contains("sk-secret"));
    }

    /**
     * 快照携带数据库检索参数，并把检索参数版本计入联合版本号。
     */
    @Test
    @DisplayName("快照合并检索参数并推进联合版本号")
    void snapshotMergesRetrievalSettings() {
        com.anynote.ai.service.RetrievalSettingService retrievalService =
                org.mockito.Mockito.mock(com.anynote.ai.service.RetrievalSettingService.class);
        com.anynote.ai.model.vo.RetrievalSettingVO saved =
                RetrievalSettingServiceImpl.defaults().toBuilder()
                        .rrfK(30).version(3L).build();
        when(retrievalService.get()).thenReturn(saved);
        when(modelProviderMapper.selectAll())
                .thenReturn(List.of(providerPO(1L, "openai", "sk-plain", 2L, 1)));

        ModelProviderServiceImpl snapshotService = new ModelProviderServiceImpl(modelProviderMapper,
                aesGcmCipher, new Gson(), null, retrievalService);
        ModelProviderSnapshotVO snapshot = snapshotService.snapshot();

        assertEquals("5:0", snapshot.getVersion());
        assertEquals(30, snapshot.getRetrieval().getRrfK());
    }

    /**
     * 未注入检索参数服务时快照下发默认值且不改变版本号。
     */
    @Test
    @DisplayName("无检索参数服务时下发默认值")
    void snapshotUsesRetrievalDefaultsWithoutService() {
        when(modelProviderMapper.selectAll()).thenReturn(Collections.emptyList());

        ModelProviderSnapshotVO snapshot = modelProviderService.snapshot();

        assertEquals("0:0", snapshot.getVersion());
        assertEquals(60, snapshot.getRetrieval().getRrfK());
        assertFalse(snapshot.getRetrieval().getRerankEnabled());
    }

    private ModelProviderServiceImpl withLogicalMapper() {
        return new ModelProviderServiceImpl(modelProviderMapper,
                aesGcmCipher, new Gson(), logicalModelConfigMapper);
    }

    private LogicalModelConfigPO logicalRow(String logicalName, String providerKey, String model,
                                            Integer dimensions, String reasoningFormat,
                                            String reasoningPassthrough, int enabled, long version) {
        return LogicalModelConfigPO.builder()
                .id(1L)
                .logicalName(logicalName)
                .providerKey(providerKey)
                .modelName(model)
                .dimensions(dimensions)
                .reasoningFormat(reasoningFormat)
                .reasoningPassthrough(reasoningPassthrough)
                .enabled(enabled)
                .version(version)
                .build();
    }

    private com.anynote.ai.model.dto.ModelProviderUpdateDTO updateDTO() {
        com.anynote.ai.model.dto.ModelProviderUpdateDTO dto =
                new com.anynote.ai.model.dto.ModelProviderUpdateDTO();
        dto.setDisplayName("OpenAI-新");
        dto.setProtocol("openai_compatible");
        dto.setBaseUrl("https://api.openai.com/v2");
        dto.setModels(List.of("new-model"));
        dto.setDataEgressAllowed(false);
        dto.setEnabled(true);
        dto.setProcessReasoningMaxChars(9000);
        return dto;
    }
}
