package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.dto.ModelProviderCreateDTO;
import com.anynote.ai.model.dto.ModelProviderUpdateDTO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.ModelProviderAdminVO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
import com.anynote.ai.properties.ModelCatalogProperties;
import com.anynote.ai.security.credential.AesGcmCipher;
import com.anynote.ai.service.ModelProviderService;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.utils.StringUtils;
import com.anynote.core.web.enums.ResCode;
import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 模型供应商目录与凭据管理实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class ModelProviderServiceImpl implements ModelProviderService {

    private static final String DEFAULT_PROTOCOL = "openai_compatible";

    private final ModelProviderMapper modelProviderMapper;

    private final ModelCatalogProperties modelCatalogProperties;

    private final AesGcmCipher aesGcmCipher;

    private final Gson gson;

    /**
     * 构造器注入。
     *
     * @param modelProviderMapper 供应商目录 Mapper
     * @param modelCatalogProperties Nacos 逻辑模型映射配置
     * @param aesGcmCipher 凭据加解密组件
     * @param gson 模型清单 JSON 序列化器
     */
    public ModelProviderServiceImpl(ModelProviderMapper modelProviderMapper,
                                    ModelCatalogProperties modelCatalogProperties,
                                    AesGcmCipher aesGcmCipher,
                                    Gson gson) {
        this.modelProviderMapper = modelProviderMapper;
        this.modelCatalogProperties = modelCatalogProperties;
        this.aesGcmCipher = aesGcmCipher;
        this.gson = gson;
    }

    @Override
    public ModelProviderSnapshotVO snapshot() {
        List<ModelProviderPO> providers = modelProviderMapper.selectAll();
        long providersVersion = providers.stream()
                .map(ModelProviderPO::getVersion)
                .filter(Objects::nonNull)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L);
        List<ModelProviderSnapshotVO.ProviderVO> providerVOS = providers.stream()
                .map(this::toProviderVO)
                .toList();
        Map<String, ModelCatalogProperties.LogicalModel> logicalModels =
                new LinkedHashMap<>(modelCatalogProperties.getLogical());
        return ModelProviderSnapshotVO.builder()
                .version(providersVersion + ":" + modelCatalogProperties.getMappingVersion())
                .providers(providerVOS)
                .logicalModels(logicalModels)
                .build();
    }

    @Override
    public List<ModelProviderAdminVO> list() {
        return modelProviderMapper.selectAll().stream().map(this::toAdminVO).toList();
    }

    @Override
    public ModelProviderAdminVO get(String providerKey) {
        return toAdminVO(getRequired(providerKey));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ModelProviderAdminVO create(ModelProviderCreateDTO dto, Long operatorId) {
        if (modelProviderMapper.selectByProviderKey(dto.getProviderKey()) != null) {
            throw new BusinessException("供应商标识已存在", ResCode.BUSINESS_ERROR);
        }
        String protocol = StringUtils.isEmpty(dto.getProtocol()) ? DEFAULT_PROTOCOL : dto.getProtocol();
        requireSupportedProtocol(protocol);
        Date now = new Date();
        ModelProviderPO provider = ModelProviderPO.builder()
                .providerKey(dto.getProviderKey())
                .displayName(dto.getDisplayName())
                .protocol(protocol)
                .baseUrl(dto.getBaseUrl())
                .apiKeyCipher(aesGcmCipher.encrypt(dto.getApiKey()))
                .modelsJson(dto.getModels() == null ? "[]" : gson.toJson(dto.getModels()))
                .dataEgressAllowed(Boolean.TRUE.equals(dto.getDataEgressAllowed()) ? 1 : 0)
                .enabled(Boolean.FALSE.equals(dto.getEnabled()) ? 0 : 1)
                .version(1L)
                .createBy(operatorId)
                .updateBy(operatorId)
                .createTime(now)
                .updateTime(now)
                .build();
        modelProviderMapper.insert(provider);
        return toAdminVO(provider);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ModelProviderAdminVO update(String providerKey, ModelProviderUpdateDTO dto, Long operatorId) {
        ModelProviderPO existing = getRequired(providerKey);
        requireSupportedProtocol(dto.getProtocol());
        String apiKeyCipher = StringUtils.isEmpty(dto.getApiKey())
                ? null
                : aesGcmCipher.encrypt(dto.getApiKey());
        ModelProviderPO provider = ModelProviderPO.builder()
                .id(existing.getId())
                .providerKey(existing.getProviderKey())
                .displayName(dto.getDisplayName())
                .protocol(dto.getProtocol())
                .baseUrl(dto.getBaseUrl())
                .apiKeyCipher(apiKeyCipher)
                .modelsJson(gson.toJson(dto.getModels()))
                .dataEgressAllowed(Boolean.TRUE.equals(dto.getDataEgressAllowed()) ? 1 : 0)
                .enabled(Boolean.TRUE.equals(dto.getEnabled()) ? 1 : 0)
                .version((existing.getVersion() == null ? 0L : existing.getVersion()) + 1)
                .createBy(existing.getCreateBy())
                .updateBy(operatorId)
                .createTime(existing.getCreateTime())
                .updateTime(new Date())
                .build();
        if (modelProviderMapper.updateById(provider) == 0) {
            throw notFound();
        }
        return toAdminVO(provider);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(String providerKey) {
        ModelProviderPO existing = getRequired(providerKey);
        if (modelProviderMapper.deleteById(existing.getId()) == 0) {
            throw notFound();
        }
    }

    private ModelProviderPO getRequired(String providerKey) {
        ModelProviderPO provider = modelProviderMapper.selectByProviderKey(providerKey);
        if (provider == null) {
            throw notFound();
        }
        return provider;
    }

    private BusinessException notFound() {
        return new BusinessException("模型供应商不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND);
    }

    private void requireSupportedProtocol(String protocol) {
        if (!DEFAULT_PROTOCOL.equals(protocol)) {
            throw new BusinessException("请求参数错误", ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private ModelProviderSnapshotVO.ProviderVO toProviderVO(ModelProviderPO provider) {
        return ModelProviderSnapshotVO.ProviderVO.builder()
                .providerKey(provider.getProviderKey())
                .displayName(provider.getDisplayName())
                .protocol(provider.getProtocol())
                .baseUrl(provider.getBaseUrl())
                .apiKey(aesGcmCipher.decrypt(provider.getApiKeyCipher()))
                .models(parseModels(provider))
                .dataEgressAllowed(Integer.valueOf(1).equals(provider.getDataEgressAllowed()))
                .enabled(Integer.valueOf(1).equals(provider.getEnabled()))
                .build();
    }

    /**
     * 转换为不携带凭据的管理视图。
     *
     * @param provider 持久化对象
     * @return 管理视图
     */
    private ModelProviderAdminVO toAdminVO(ModelProviderPO provider) {
        return ModelProviderAdminVO.builder()
                .providerKey(provider.getProviderKey())
                .displayName(provider.getDisplayName())
                .protocol(provider.getProtocol())
                .baseUrl(provider.getBaseUrl())
                .models(parseModels(provider))
                .dataEgressAllowed(Integer.valueOf(1).equals(provider.getDataEgressAllowed()))
                .enabled(Integer.valueOf(1).equals(provider.getEnabled()))
                .version(provider.getVersion())
                .createTime(provider.getCreateTime())
                .updateTime(provider.getUpdateTime())
                .build();
    }

    /**
     * 解析 models 列中的 JSON 数组字符串。
     *
     * @param provider 持久化对象
     * @return 模型名列表
     */
    private List<String> parseModels(ModelProviderPO provider) {
        String modelsJson = provider.getModelsJson();
        if (StringUtils.isEmpty(modelsJson)) {
            return Collections.emptyList();
        }
        try {
            List<String> models = gson.fromJson(modelsJson, new TypeToken<List<String>>() { }.getType());
            return models == null ? Collections.emptyList() : models;
        } catch (JsonSyntaxException e) {
            throw new BusinessException("模型供应商模型清单格式错误: " + provider.getProviderKey(),
                    ResCode.BUSINESS_ERROR);
        }
    }
}
