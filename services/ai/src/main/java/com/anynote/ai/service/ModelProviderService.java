package com.anynote.ai.service;

import com.anynote.ai.model.dto.ModelProviderUpsertDTO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;

/**
 * 模型供应商目录与凭据管理服务。
 *
 * <p>凭据以 AES-GCM 密文落库，快照输出时才解密；本服务不记录明文凭据。</p>
 *
 * @author 称霸幼儿园
 */
public interface ModelProviderService {

    /**
     * 生成模型供应商配置快照：全表读取、解密 apiKey、合并 Nacos 逻辑模型映射。
     *
     * @return 快照，版本号格式为 {@code providersVersion:mappingVersion}
     */
    ModelProviderSnapshotVO snapshot();

    /**
     * 新增或更新供应商：按 providerKey 判断，存在则更新并把 version 加 1，否则插入 version=1。
     *
     * @param dto 供应商配置，apiKey 为明文入参
     * @return 操作完成后的快照版本号，与 {@link #snapshot()} 的 version 同源
     */
    String upsert(ModelProviderUpsertDTO dto);

    /**
     * 按 providerKey 硬删除供应商。
     *
     * @param providerKey 供应商标识
     * @return 删除成功返回 {@code true}；记录不存在返回 {@code false}
     */
    boolean delete(String providerKey);
}
