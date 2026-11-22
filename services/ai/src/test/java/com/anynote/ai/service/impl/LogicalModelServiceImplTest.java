package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.LogicalModelConfigMapper;
import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.dto.LogicalModelConfigUpdateDTO;
import com.anynote.ai.model.po.LogicalModelConfigPO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.LogicalModelConfigVO;
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
 * 运行时逻辑模型配置服务单元测试（agent_main、fast、embedding）。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class LogicalModelServiceImplTest {

    @Mock
    private LogicalModelConfigMapper logicalModelConfigMapper;

    @Mock
    private ModelProviderMapper modelProviderMapper;

    private LogicalModelServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new LogicalModelServiceImpl(logicalModelConfigMapper, modelProviderMapper);
    }

    /**
     * 未持久化的逻辑名返回默认关闭态；持久化记录按数据库字段返回（含推理配置）。
     */
    @Test
    @DisplayName("未持久化返回默认关闭态，持久化后按行返回推理配置")
    void readsDatabaseRowOrDefaultOff() {
        when(logicalModelConfigMapper.selectByLogicalName("agent_main")).thenReturn(null);
        LogicalModelConfigVO absent = service.getConfig("agent_main");
        assertFalse(absent.getEnabled());
        assertFalse(absent.getSupportsVision());
        assertEquals("none", absent.getReasoningFormat());
        assertEquals("none", absent.getReasoningPassthrough());
        assertEquals(0L, absent.getVersion());

        when(logicalModelConfigMapper.selectByLogicalName("agent_main")).thenReturn(row("agent_main",
                "qwen", "qwen-max", null, "reasoning_content", "empty", 1, 2L));
        LogicalModelConfigVO saved = service.getConfig("agent_main");
        assertTrue(saved.getEnabled());
        assertEquals("qwen", saved.getProviderKey());
        assertEquals("qwen-max", saved.getModel());
        assertEquals("reasoning_content", saved.getReasoningFormat());
        assertEquals("empty", saved.getReasoningPassthrough());
        assertEquals(2L, saved.getVersion());
    }

    /**
     * 路径参数只接受 agent_main、fast、embedding，其余返回参数错误。
     */
    @Test
    @DisplayName("未知逻辑名返回参数错误")
    void rejectsUnknownLogicalName() {
        BusinessException error = assertThrows(BusinessException.class, () -> service.getConfig("unknown"));
        assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, error.getErrorCode());
        BusinessException updateError = assertThrows(BusinessException.class,
                () -> service.updateConfig("unknown", updateDto("p", "m", null, "none", "none", true), 1L));
        assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, updateError.getErrorCode());
        verify(logicalModelConfigMapper, never()).insert(any(LogicalModelConfigPO.class));
    }

    /**
     * 启用 agent_main 时校验供应商存在、启用、允许数据出境与模型名；数据出境文案用对话口径。
     */
    @Test
    @DisplayName("保存 agent_main 时校验出境与模型名")
    void validatesChatEgressAndModel() {
        when(modelProviderMapper.selectByProviderKey("no_egress")).thenReturn(provider("no_egress", 1, 0));
        BusinessException egressError = assertThrows(BusinessException.class,
                () -> service.updateConfig("agent_main",
                        updateDto("no_egress", "m", null, "none", "none", true), 1L));
        assertEquals(ResCode.BUSINESS_ERROR, egressError.getErrorCode());
        assertEquals("所选供应商未允许数据出境，无法用于知识对话", egressError.getErrorMessage());

        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(provider("openai", 1, 1));
        BusinessException emptyModelError = assertThrows(BusinessException.class,
                () -> service.updateConfig("agent_main",
                        updateDto("openai", "   ", null, "none", "none", true), 1L));
        assertEquals("请选择模型", emptyModelError.getErrorMessage());
    }

    /**
     * embedding 保留维度与出境专属校验；非 embedding 传维度返回参数错误。
     */
    @Test
    @DisplayName("embedding 维度校验保留且非 embedding 拒绝维度字段")
    void keepsEmbeddingOnlyRules() {
        BusinessException dimsError = assertThrows(BusinessException.class,
                () -> service.updateConfig("embedding",
                        updateDto("openai", "m", 2049, "none", "none", true), 1L));
        assertEquals("向量维度必须在 1 到 2048 之间", dimsError.getErrorMessage());

        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(provider("openai", 1, 1));
        BusinessException chatDimsError = assertThrows(BusinessException.class,
                () -> service.updateConfig("fast",
                        updateDto("openai", "m", 1024, "none", "none", true), 1L));
        assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, chatDimsError.getErrorCode());

        when(modelProviderMapper.selectByProviderKey("no_egress")).thenReturn(provider("no_egress", 1, 0));
        BusinessException egressError = assertThrows(BusinessException.class,
                () -> service.updateConfig("embedding",
                        updateDto("no_egress", "m", null, "none", "none", true), 1L));
        assertEquals("所选供应商未允许数据出境，无法用于知识向量索引", egressError.getErrorMessage());

        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(provider("openai", 1, 1));
        BusinessException emptyModelError = assertThrows(BusinessException.class,
                () -> service.updateConfig("embedding",
                        updateDto("openai", "   ", null, "none", "none", true), 1L));
        assertEquals("请选择 Embedding 模型", emptyModelError.getErrorMessage());
    }

    /**
     * 推理格式与回传方式只接受三个合法值，空值回落 none；非法值返回参数错误。
     */
    @Test
    @DisplayName("推理格式与回传方式枚举校验")
    void validatesReasoningEnums() {
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(provider("openai", 1, 1));
        BusinessException badFormat = assertThrows(BusinessException.class,
                () -> service.updateConfig("agent_main",
                        updateDto("openai", "m", null, "auto", "none", true), 1L));
        assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, badFormat.getErrorCode());
        BusinessException badPassthrough = assertThrows(BusinessException.class,
                () -> service.updateConfig("agent_main",
                        updateDto("openai", "m", null, "think_tag", "full", true), 1L));
        assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, badPassthrough.getErrorCode());

        when(logicalModelConfigMapper.selectByLogicalName("agent_main")).thenReturn(null);
        LogicalModelConfigVO created = service.updateConfig("agent_main",
                updateDto("openai", "m", null, "think_tag", "original", true), 7L);
        ArgumentCaptor<LogicalModelConfigPO> captor = ArgumentCaptor.forClass(LogicalModelConfigPO.class);
        verify(logicalModelConfigMapper).insert(captor.capture());
        assertEquals("think_tag", captor.getValue().getReasoningFormat());
        assertEquals("original", captor.getValue().getReasoningPassthrough());
        assertEquals("think_tag", created.getReasoningFormat());

        LogicalModelConfigVO defaulted = service.updateConfig("agent_main",
                updateDto("openai", "m", null, null, null, true), 7L);
        assertEquals("none", defaulted.getReasoningFormat());
        assertEquals("none", defaulted.getReasoningPassthrough());
    }

    /**
     * 更新已有记录走 update 并递增版本；关闭允许停用。
     */
    @Test
    @DisplayName("更新已有绑定记录时递增版本且允许停用")
    void updatesExistingBindingAndSupportsDisabling() {
        when(logicalModelConfigMapper.selectByLogicalName("agent_main"))
                .thenReturn(row("agent_main", "openai", "gpt-4o", null, "none", "none", 1, 2L));
        when(modelProviderMapper.selectByProviderKey("openai")).thenReturn(provider("openai", 1, 1));

        LogicalModelConfigVO updated = service.updateConfig("agent_main",
                updateDto("openai", "gpt-4o", null, "reasoning", "none", false), 9L);
        verify(logicalModelConfigMapper, never()).insert(any(LogicalModelConfigPO.class));
        verify(logicalModelConfigMapper).updateById(any(LogicalModelConfigPO.class));
        assertFalse(updated.getEnabled());
        assertEquals("reasoning", updated.getReasoningFormat());
        assertEquals(3L, updated.getVersion());
    }

    /**
     * 停用但传了不存在的供应商时仍返回供应商不存在。
     */
    @Test
    @DisplayName("停用配置引用不存在供应商返回不存在")
    void disablingWithUnknownProviderStillRejected() {
        when(modelProviderMapper.selectByProviderKey("missing")).thenReturn(null);
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.updateConfig("fast",
                        updateDto("missing", null, null, "none", "none", false), 1L));
        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, error.getErrorCode());
        assertEquals("所选模型供应商不存在", error.getErrorMessage());
    }

    /**
     * enabled 缺失返回参数错误。
     */
    @Test
    @DisplayName("enabled 缺失返回参数错误")
    void rejectsMissingEnabled() {
        LogicalModelConfigUpdateDTO dto = updateDto("openai", "m", null, "none", "none", true);
        dto.setEnabled(null);
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.updateConfig("agent_main", dto, 1L));
        assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, error.getErrorCode());
    }

    /**
     * 仅 agent_main 可声明视觉能力，其他逻辑模型开启时复用参数错误。
     */
    @Test
    void supportsVisionOnlyForAgentMain() {
        LogicalModelConfigUpdateDTO mainRequest = updateDto(null, null, null, "none", "none", false);
        mainRequest.setSupportsVision(true);
        when(logicalModelConfigMapper.selectByLogicalName("agent_main")).thenReturn(null);

        LogicalModelConfigVO updated = service.updateConfig("agent_main", mainRequest, 7L);

        ArgumentCaptor<LogicalModelConfigPO> captor = ArgumentCaptor.forClass(LogicalModelConfigPO.class);
        verify(logicalModelConfigMapper).insert(captor.capture());
        assertEquals(1, captor.getValue().getSupportsVision());
        assertTrue(updated.getSupportsVision());
        for (String logicalName : new String[]{"fast", "embedding"}) {
            LogicalModelConfigUpdateDTO rejected = updateDto(null, null, null, "none", "none", false);
            rejected.setSupportsVision(true);
            BusinessException error = assertThrows(BusinessException.class,
                    () -> service.updateConfig(logicalName, rejected, 7L));
            assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, error.getErrorCode());
            assertEquals("请求参数错误", error.getErrorMessage());
        }
    }

    private LogicalModelConfigPO row(String logicalName, String providerKey, String model,
                                     Integer dimensions, String reasoningFormat,
                                     String reasoningPassthrough, int enabled, long version) {
        return LogicalModelConfigPO.builder()
                .id(5L)
                .logicalName(logicalName)
                .providerKey(providerKey)
                .modelName(model)
                .dimensions(dimensions)
                .reasoningFormat(reasoningFormat)
                .reasoningPassthrough(reasoningPassthrough)
                .enabled(enabled)
                .version(version)
                .updateTime(new Date(1000L))
                .build();
    }

    private LogicalModelConfigUpdateDTO updateDto(String providerKey, String model, Integer dimensions,
                                                  String reasoningFormat, String reasoningPassthrough,
                                                  Boolean enabled) {
        LogicalModelConfigUpdateDTO dto = new LogicalModelConfigUpdateDTO();
        dto.setProviderKey(providerKey);
        dto.setModel(model);
        dto.setDimensions(dimensions);
        dto.setReasoningFormat(reasoningFormat);
        dto.setReasoningPassthrough(reasoningPassthrough);
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
