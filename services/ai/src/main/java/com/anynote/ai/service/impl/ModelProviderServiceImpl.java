package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.ModelProviderMapper;
import com.anynote.ai.model.dto.ModelProviderUpsertDTO;
import com.anynote.ai.model.po.ModelProviderPO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
import com.anynote.ai.properties.ModelCatalogProperties;
import com.anynote.ai.security.credential.AesGcmCipher;
import com.anynote.ai.service.ModelProviderService;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.utils.StringUtils;
import com.anynote.core.web.enums.ResCode;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 模型供应商目录与凭据管理实现。
 *
 * <p>upsert 的空值语义：{@code protocol}、{@code models}、{@code dataEgressAllowed}、{@code enabled}
 * 为 {@code null}/空白时，新增按表默认值落库，更新保留数据库中的原值；{@code apiKey} 每次都由
 * 明文重新加密后写入，不存在「不更新凭据」的分支。</p>
 *
 * @author 称霸幼儿园
 */
@Service
public class ModelProviderServiceImpl implements ModelProviderService {

    /** 新增时的默认协议。 */
    private static final String DEFAULT_PROTOCOL = "openai_compatible";

    private final ModelProviderMapper modelProviderMapper;

    private final ModelCatalogProperties modelCatalogProperties;

    private final AesGcmCipher aesGcmCipher;

    private final Gson gson;

    /**
     * 构造器注入。
     *
     * @param modelProviderMapper      供应商目录 Mapper
     * @param modelCatalogProperties  Nacos 逻辑模型映射配置
     * @param aesGcmCipher            凭据加解密组件
     * @param gson                    模型清单 JSON 序列化器
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
                .collect(Collectors.toList());
        Map<String, ModelCatalogProperties.LogicalModel> logicalModels =
                new LinkedHashMap<>(modelCatalogProperties.getLogical());
        return ModelProviderSnapshotVO.builder()
                .version(providersVersion + ":" + modelCatalogProperties.getMappingVersion())
                .providers(providerVOS)
                .logicalModels(logicalModels)
                .build();
    }

    @Override
    public String upsert(ModelProviderUpsertDTO dto) {
        String apiKeyCipher = aesGcmCipher.encrypt(dto.getApiKey());
        Date now = new Date();
        ModelProviderPO existing = modelProviderMapper.selectByProviderKey(dto.getProviderKey());
        if (existing == null) {
            modelProviderMapper.insert(ModelProviderPO.builder()
                    .providerKey(dto.getProviderKey())
                    .displayName(dto.getDisplayName())
                    .protocol(StringUtils.isEmpty(dto.getProtocol()) ? DEFAULT_PROTOCOL : dto.getProtocol())
                    .baseUrl(dto.getBaseUrl())
                    .apiKeyCipher(apiKeyCipher)
                    .modelsJson(dto.getModels() == null ? "[]" : gson.toJson(dto.getModels()))
                    .dataEgressAllowed(Boolean.TRUE.equals(dto.getDataEgressAllowed()) ? 1 : 0)
                    .enabled(Boolean.FALSE.equals(dto.getEnabled()) ? 0 : 1)
                    .version(1L)
                    .createBy(0L)
                    .updateBy(0L)
                    .createTime(now)
                    .updateTime(now)
                    .build());
        } else {
            modelProviderMapper.updateById(ModelProviderPO.builder()
                    .id(existing.getId())
                    .displayName(dto.getDisplayName())
                    .protocol(StringUtils.isEmpty(dto.getProtocol()) ? existing.getProtocol() : dto.getProtocol())
                    .baseUrl(dto.getBaseUrl())
                    .apiKeyCipher(apiKeyCipher)
                    .modelsJson(dto.getModels() == null ? existing.getModelsJson() : gson.toJson(dto.getModels()))
                    .dataEgressAllowed(dto.getDataEgressAllowed() == null
                            ? existing.getDataEgressAllowed()
                            : (Boolean.TRUE.equals(dto.getDataEgressAllowed()) ? 1 : 0))
                    .enabled(dto.getEnabled() == null
                            ? existing.getEnabled()
                            : (Boolean.FALSE.equals(dto.getEnabled()) ? 0 : 1))
                    .version((existing.getVersion() == null ? 0L : existing.getVersion()) + 1)
                    .updateBy(0L)
                    .updateTime(now)
                    .build());
        }
        return snapshot().getVersion();
    }

    @Override
    public boolean delete(String providerKey) {
        if (StringUtils.isEmpty(providerKey)) {
            return false;
        }
        return modelProviderMapper.delete(new LambdaQueryWrapper<ModelProviderPO>()
                .eq(ModelProviderPO::getProviderKey, providerKey)) > 0;
    }

    /**
     * 将持久化对象转换为快照中的供应商节点，并解密 apiKey。
     *
     * @param provider 持久化对象
     * @return 供应商快照节点
     */
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
     * 解析 models 列中的 JSON 数组字符串。
     *
     * @param provider 持久化对象
     * @return 模型名列表，空或非法时返回空列表
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
