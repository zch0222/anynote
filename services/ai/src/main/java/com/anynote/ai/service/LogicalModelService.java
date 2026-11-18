package com.anynote.ai.service;

import com.anynote.ai.model.dto.LogicalModelConfigUpdateDTO;
import com.anynote.ai.model.vo.LogicalModelConfigVO;

import java.util.List;

/**
 * 运行时逻辑模型配置服务（agent_main、fast、embedding）。
 *
 * @author 称霸幼儿园
 */
public interface LogicalModelService {

    /**
     * 全部逻辑模型用途名（管理端点路径参数白名单）。
     */
    List<String> LOGICAL_NAMES = List.of("agent_main", "fast", "embedding");

    /**
     * 读取单个逻辑模型配置；未持久化时返回默认关闭态。
     *
     * @param logicalName 逻辑模型用途名
     * @return 当前配置
     */
    LogicalModelConfigVO getConfig(String logicalName);

    /**
     * 保存并校验单个逻辑模型配置。
     *
     * @param logicalName 逻辑模型用途名
     * @param request 更新请求
     * @param operatorId 操作管理员用户 id
     * @return 更新后的配置
     */
    LogicalModelConfigVO updateConfig(String logicalName, LogicalModelConfigUpdateDTO request, Long operatorId);
}
