package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.LogicalModelConfigMapper;
import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.dto.EmbeddingModelConfigUpdateDTO;
import com.anynote.ai.model.po.LogicalModelConfigPO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.EmbeddingModelConfigVO;
import com.anynote.ai.properties.ModelCatalogProperties;
import com.anynote.ai.service.LogicalModelService;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 运行时逻辑模型配置实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class LogicalModelServiceImpl implements LogicalModelService {

    public static final String LOGICAL_EMBEDDING = "embedding";
    private static final int MIN_DIMENSIONS = 1;
    private static final int MAX_DIMENSIONS = 2048;

    private final LogicalModelConfigMapper logicalModelConfigMapper;
    private final ModelProviderMapper modelProviderMapper;
    private final ModelCatalogProperties modelCatalogProperties;

    /**
     * 构造运行时逻辑模型配置服务。
     *
     * @param logicalModelConfigMapper 逻辑模型配置映射器
     * @param modelProviderMapper 模型供应商映射器
     * @param modelCatalogProperties 静态模型目录配置
     */
    public LogicalModelServiceImpl(LogicalModelConfigMapper logicalModelConfigMapper,
                                   ModelProviderMapper modelProviderMapper,
                                   ModelCatalogProperties modelCatalogProperties) {
        this.logicalModelConfigMapper = logicalModelConfigMapper;
        this.modelProviderMapper = modelProviderMapper;
        this.modelCatalogProperties = modelCatalogProperties;
    }

    @Override
    public EmbeddingModelConfigVO getEmbeddingConfig() {
        LogicalModelConfigPO saved = logicalModelConfigMapper.selectByLogicalName(LOGICAL_EMBEDDING);
        if (saved != null) {
            return toVO(saved);
        }
        ModelCatalogProperties.LogicalModel fallback = modelCatalogProperties == null
                || modelCatalogProperties.getLogical() == null
                ? null
                : modelCatalogProperties.getLogical().get(LOGICAL_EMBEDDING);
        if (fallback != null) {
            String provider = trimToNull(fallback.getProvider());
            String model = trimToNull(fallback.getModel());
            boolean enabled = fallback.getEnabled() != null
                    ? fallback.getEnabled()
                    : (provider != null && model != null);
            return EmbeddingModelConfigVO.builder()
                    .logicalName(LOGICAL_EMBEDDING)
                    .providerKey(provider)
                    .model(model)
                    .dimensions(fallback.getDimensions())
                    .enabled(enabled)
                    .version(0L)
                    .build();
        }
        return EmbeddingModelConfigVO.builder()
                .logicalName(LOGICAL_EMBEDDING)
                .enabled(false)
                .version(0L)
                .build();
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public EmbeddingModelConfigVO updateEmbeddingConfig(EmbeddingModelConfigUpdateDTO request, Long operatorId) {
        if (request == null || request.getEnabled() == null) {
            throw new BusinessException("请求参数错误", ResCode.USER_REQUEST_PARAM_ERROR);
        }
        Integer dimensions = request.getDimensions();
        if (dimensions != null && (dimensions < MIN_DIMENSIONS || dimensions > MAX_DIMENSIONS)) {
            throw new BusinessException("向量维度必须在 1 到 2048 之间", ResCode.USER_REQUEST_PARAM_ERROR);
        }
        boolean enabled = Boolean.TRUE.equals(request.getEnabled());
        String providerKey = trimToNull(request.getProviderKey());
        String model = trimToNull(request.getModel());

        if (enabled) {
            if (providerKey == null) {
                throw new BusinessException("请选择模型供应商", ResCode.USER_REQUEST_PARAM_ERROR);
            }
            ModelProviderPO provider = modelProviderMapper.selectByProviderKey(providerKey);
            if (provider == null) {
                throw new BusinessException("所选模型供应商不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND);
            }
            if (!Integer.valueOf(1).equals(provider.getEnabled())) {
                throw new BusinessException("所选模型供应商已停用", ResCode.BUSINESS_ERROR);
            }
            if (!Integer.valueOf(1).equals(provider.getDataEgressAllowed())) {
                throw new BusinessException("所选供应商未允许数据出境，无法用于知识向量索引", ResCode.BUSINESS_ERROR);
            }
            if (model == null) {
                throw new BusinessException("请选择 Embedding 模型", ResCode.USER_REQUEST_PARAM_ERROR);
            }
        } else if (providerKey != null && modelProviderMapper.selectByProviderKey(providerKey) == null) {
            throw new BusinessException("所选模型供应商不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND);
        }

        LogicalModelConfigPO existing = logicalModelConfigMapper.selectByLogicalName(LOGICAL_EMBEDDING);
        if (existing == null) {
            LogicalModelConfigPO inserted = LogicalModelConfigPO.builder()
                    .logicalName(LOGICAL_EMBEDDING)
                    .providerKey(providerKey)
                    .modelName(model)
                    .dimensions(dimensions)
                    .enabled(enabled ? 1 : 0)
                    .version(1L)
                    .createBy(operatorId == null ? 0L : operatorId)
                    .updateBy(operatorId == null ? 0L : operatorId)
                    .build();
            logicalModelConfigMapper.insert(inserted);
            LogicalModelConfigPO persisted = logicalModelConfigMapper.selectByLogicalName(LOGICAL_EMBEDDING);
            return toVO(persisted == null ? inserted : persisted);
        }

        existing.setProviderKey(providerKey);
        existing.setModelName(model);
        existing.setDimensions(dimensions);
        existing.setEnabled(enabled ? 1 : 0);
        existing.setVersion((existing.getVersion() == null ? 0L : existing.getVersion()) + 1L);
        existing.setUpdateBy(operatorId == null ? 0L : operatorId);
        logicalModelConfigMapper.updateById(existing);
        LogicalModelConfigPO refreshed = logicalModelConfigMapper.selectByLogicalName(LOGICAL_EMBEDDING);
        return toVO(refreshed == null ? existing : refreshed);
    }

    private EmbeddingModelConfigVO toVO(LogicalModelConfigPO po) {
        return EmbeddingModelConfigVO.builder()
                .logicalName(po.getLogicalName())
                .providerKey(po.getProviderKey())
                .model(po.getModelName())
                .dimensions(po.getDimensions())
                .enabled(Integer.valueOf(1).equals(po.getEnabled()))
                .version(po.getVersion())
                .updateTime(po.getUpdateTime())
                .build();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
