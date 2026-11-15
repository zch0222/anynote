package com.anynote.ai.mapper;

import com.anynote.ai.model.po.AgentRunPO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Agent 运行记录映射器。
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface AgentRunMapper extends BaseMapper<AgentRunPO> {

    /**
     * 按运行标识和用户标识查询运行记录。
     *
     * @param runId 运行标识
     * @param userId 用户标识
     * @return 匹配的运行记录，不存在时返回 null
     */
    AgentRunPO selectOwned(@Param("runId") String runId, @Param("userId") Long userId);
}
