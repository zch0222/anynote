package com.anynote.ai.mapper;

import com.anynote.ai.model.po.LogicalModelConfigPO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 运行时逻辑模型配置映射器。
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface LogicalModelConfigMapper extends BaseMapper<LogicalModelConfigPO> {

    /**
     * 按逻辑名称查询绑定配置。
     *
     * @param logicalName 逻辑名称，如 embedding
     * @return 配置实体，不存在返回 null
     */
    LogicalModelConfigPO selectByLogicalName(@Param("logicalName") String logicalName);
}
