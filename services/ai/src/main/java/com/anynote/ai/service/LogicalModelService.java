package com.anynote.ai.service;

import com.anynote.ai.model.dto.EmbeddingModelConfigUpdateDTO;
import com.anynote.ai.model.vo.EmbeddingModelConfigVO;

/**
 * 运行时逻辑模型配置服务。
 *
 * @author 称霸幼儿园
 */
public interface LogicalModelService {

    /**
     * 读取当前 Embedding 逻辑模型配置。
     *
     * @return 当前配置
     */
    EmbeddingModelConfigVO getEmbeddingConfig();

    /**
     * 保存并校验 Embedding 逻辑模型配置。
     *
     * @param request 更新请求
     * @param operatorId 操作管理员用户 id
     * @return 更新后的配置
     */
    EmbeddingModelConfigVO updateEmbeddingConfig(EmbeddingModelConfigUpdateDTO request, Long operatorId);
}
