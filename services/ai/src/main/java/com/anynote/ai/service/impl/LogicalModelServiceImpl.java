package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.LogicalModelConfigMapper;
import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.dto.LogicalModelConfigUpdateDTO;
import com.anynote.ai.model.po.LogicalModelConfigPO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.LogicalModelConfigVO;
import com.anynote.ai.service.LogicalModelService;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * 运行时逻辑模型配置实现（agent_main、fast、embedding），数据库为唯一配置来源。
 *
 * @author 称霸幼儿园
 */
@Service
public class LogicalModelServiceImpl implements LogicalModelService {

    public static final String LOGICAL_EMBEDDING = "embedding";
    private static final int MIN_DIMENSIONS = 1;
    private static final int MAX_DIMENSIONS = 2048;
    private static final String INVALID_REQUEST_MESSAGE = "请求参数错误";
    private static final String INVALID_LOGICAL_NAME_MESSAGE = "请求参数错误";
    private static final String EMBEDDING_MODEL_REQUIRED_MESSAGE = "请选择 Embedding 模型";
    private static final String MODEL_REQUIRED_MESSAGE = "请选择模型";
    private static final String PROVIDER_REQUIRED_MESSAGE = "请选择模型供应商";
    private static final String PROVIDER_NOT_FOUND_MESSAGE = "所选模型供应商不存在";
    private static final String PROVIDER_DISABLED_MESSAGE = "所选模型供应商已停用";
    private static final String EMBEDDING_EGRESS_MESSAGE = "所选供应商未允许数据出境，无法用于知识向量索引";
    private static final String CHAT_EGRESS_MESSAGE = "所选供应商未允许数据出境，无法用于知识对话";
    private static final String DIMENSIONS_RANGE_MESSAGE = "向量维度必须在 1 到 2048 之间";
    private static final Set<String> REASONING_FORMATS = Set.of("none", "reasoning_content", "reasoning", "think_tag");
    private static final Set<String> REASONING_PASSTHROUGHS = Set.of("none", "empty", "original");

    private final LogicalModelConfigMapper logicalModelConfigMapper;
    private final ModelProviderMapper modelProviderMapper;

    /**
     * 构造运行时逻辑模型配置服务。
     *
     * @param logicalModelConfigMapper 逻辑模型配置映射器
     * @param modelProviderMapper 模型供应商映射器
     */
    public LogicalModelServiceImpl(LogicalModelConfigMapper logicalModelConfigMapper,
                                   ModelProviderMapper modelProviderMapper) {
        this.logicalModelConfigMapper = logicalModelConfigMapper;
        this.modelProviderMapper = modelProviderMapper;
    }

    @Override
    public LogicalModelConfigVO getConfig(String logicalName) {
        requireKnownLogicalName(logicalName);
        LogicalModelConfigPO saved = logicalModelConfigMapper.selectByLogicalName(logicalName);
        if (saved == null) {
            return LogicalModelConfigVO.builder()
                    .logicalName(logicalName)
                    .reasoningFormat("none")
                    .reasoningPassthrough("none")
                    .enabled(false)
                    .version(0L)
                    .build();
        }
        return toVO(saved);
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public LogicalModelConfigVO updateConfig(String logicalName, LogicalModelConfigUpdateDTO request, Long operatorId) {
        requireKnownLogicalName(logicalName);
        if (request == null || request.getEnabled() == null) {
            throw new BusinessException(INVALID_REQUEST_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        boolean isEmbedding = LOGICAL_EMBEDDING.equals(logicalName);
        Integer dimensions = request.getDimensions();
        if (isEmbedding && dimensions != null
                && (dimensions < MIN_DIMENSIONS || dimensions > MAX_DIMENSIONS)) {
            throw new BusinessException(DIMENSIONS_RANGE_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (!isEmbedding && dimensions != null) {
            throw new BusinessException(INVALID_REQUEST_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        String reasoningFormat = normalizeEnum(request.getReasoningFormat(), REASONING_FORMATS, "none");
        String reasoningPassthrough = normalizeEnum(request.getReasoningPassthrough(), REASONING_PASSTHROUGHS, "none");
        boolean enabled = Boolean.TRUE.equals(request.getEnabled());
        String providerKey = trimToNull(request.getProviderKey());
        String model = trimToNull(request.getModel());

        if (enabled) {
            if (providerKey == null) {
                throw new BusinessException(PROVIDER_REQUIRED_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
            }
            ModelProviderPO provider = modelProviderMapper.selectByProviderKey(providerKey);
            if (provider == null) {
                throw new BusinessException(PROVIDER_NOT_FOUND_MESSAGE, ResCode.INVALID_USER_INPUT_NOT_FOUND);
            }
            if (!Integer.valueOf(1).equals(provider.getEnabled())) {
                throw new BusinessException(PROVIDER_DISABLED_MESSAGE, ResCode.BUSINESS_ERROR);
            }
            if (!Integer.valueOf(1).equals(provider.getDataEgressAllowed())) {
                throw new BusinessException(
                        isEmbedding ? EMBEDDING_EGRESS_MESSAGE : CHAT_EGRESS_MESSAGE,
                        ResCode.BUSINESS_ERROR);
            }
            if (model == null) {
                throw new BusinessException(
                        isEmbedding ? EMBEDDING_MODEL_REQUIRED_MESSAGE : MODEL_REQUIRED_MESSAGE,
                        ResCode.USER_REQUEST_PARAM_ERROR);
            }
        } else if (providerKey != null && modelProviderMapper.selectByProviderKey(providerKey) == null) {
            throw new BusinessException(PROVIDER_NOT_FOUND_MESSAGE, ResCode.INVALID_USER_INPUT_NOT_FOUND);
        }

        LogicalModelConfigPO existing = logicalModelConfigMapper.selectByLogicalName(logicalName);
        if (existing == null) {
            LogicalModelConfigPO inserted = LogicalModelConfigPO.builder()
                    .logicalName(logicalName)
                    .providerKey(providerKey)
                    .modelName(model)
                    .dimensions(dimensions)
                    .reasoningFormat(reasoningFormat)
                    .reasoningPassthrough(reasoningPassthrough)
                    .enabled(enabled ? 1 : 0)
                    .version(1L)
                    .createBy(operatorId == null ? 0L : operatorId)
                    .updateBy(operatorId == null ? 0L : operatorId)
                    .build();
            logicalModelConfigMapper.insert(inserted);
            LogicalModelConfigPO persisted = logicalModelConfigMapper.selectByLogicalName(logicalName);
            return toVO(persisted == null ? inserted : persisted);
        }

        existing.setProviderKey(providerKey);
        existing.setModelName(model);
        existing.setDimensions(dimensions);
        existing.setReasoningFormat(reasoningFormat);
        existing.setReasoningPassthrough(reasoningPassthrough);
        existing.setEnabled(enabled ? 1 : 0);
        existing.setVersion((existing.getVersion() == null ? 0L : existing.getVersion()) + 1L);
        existing.setUpdateBy(operatorId == null ? 0L : operatorId);
        logicalModelConfigMapper.updateById(existing);
        LogicalModelConfigPO refreshed = logicalModelConfigMapper.selectByLogicalName(logicalName);
        return toVO(refreshed == null ? existing : refreshed);
    }

    private LogicalModelConfigVO toVO(LogicalModelConfigPO po) {
        return LogicalModelConfigVO.builder()
                .logicalName(po.getLogicalName())
                .providerKey(po.getProviderKey())
                .model(po.getModelName())
                .dimensions(po.getDimensions())
                .reasoningFormat(po.getReasoningFormat() == null ? "none" : po.getReasoningFormat())
                .reasoningPassthrough(po.getReasoningPassthrough() == null ? "none" : po.getReasoningPassthrough())
                .enabled(Integer.valueOf(1).equals(po.getEnabled()))
                .version(po.getVersion())
                .updateTime(po.getUpdateTime())
                .build();
    }

    private void requireKnownLogicalName(String logicalName) {
        if (logicalName == null || !LOGICAL_NAMES.contains(logicalName)) {
            throw new BusinessException(INVALID_LOGICAL_NAME_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private String normalizeEnum(String value, Set<String> allowed, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String normalized = value.trim();
        if (!allowed.contains(normalized)) {
            throw new BusinessException(INVALID_REQUEST_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
