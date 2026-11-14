package com.anynote.ai.service;

import com.anynote.ai.model.dto.ModelProviderCreateDTO;
import com.anynote.ai.model.dto.ModelProviderUpdateDTO;
import com.anynote.ai.model.vo.ModelProviderAdminVO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;

import java.util.List;

/**
 * 模型供应商目录与凭据管理服务。
 *
 * @author 称霸幼儿园
 */
public interface ModelProviderService {

    /**
     * 生成供 Python 使用的模型供应商配置快照。
     *
     * @return 含内部明文凭据的快照
     */
    ModelProviderSnapshotVO snapshot();

    /**
     * 查询全部供应商的非敏感管理视图。
     *
     * @return 供应商列表
     */
    List<ModelProviderAdminVO> list();

    /**
     * 查询单个供应商的非敏感管理视图。
     *
     * @param providerKey 供应商标识
     * @return 供应商管理视图
     */
    ModelProviderAdminVO get(String providerKey);

    /**
     * 新增供应商并加密保存凭据。
     *
     * @param dto 新增请求
     * @param operatorId 系统管理员用户 ID
     * @return 非敏感管理视图
     */
    ModelProviderAdminVO create(ModelProviderCreateDTO dto, Long operatorId);

    /**
     * 整体更新供应商，空白 API Key 保留原凭据。
     *
     * @param providerKey 供应商标识
     * @param dto 整体更新请求
     * @param operatorId 系统管理员用户 ID
     * @return 非敏感管理视图
     */
    ModelProviderAdminVO update(String providerKey, ModelProviderUpdateDTO dto, Long operatorId);

    /**
     * 按供应商标识硬删除。
     *
     * @param providerKey 供应商标识
     */
    void delete(String providerKey);
}
