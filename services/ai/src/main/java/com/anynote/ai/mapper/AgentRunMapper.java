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

    /**
     * 管理端按筛选条件查询运行列表（分页由 PageHelper 接管）。
     *
     * @param userId 用户标识，可空
     * @param runId 运行标识前缀，可空
     * @param outcome 结果类型，可空
     * @param startedFrom 开始时间下界，可空
     * @param startedTo 开始时间上界，可空
     * @return 运行记录列表
     */
    java.util.List<AgentRunPO> selectAdminList(@Param("userId") Long userId,
                                               @Param("runId") String runId,
                                               @Param("outcome") String outcome,
                                               @Param("startedFrom") java.util.Date startedFrom,
                                               @Param("startedTo") java.util.Date startedTo);

    /**
     * 查询管理端统计所需的运行字段。
     *
     * @param startedFrom 开始时间下界
     * @param startedTo 开始时间上界
     * @return 统计查询行
     */
    java.util.List<com.anynote.ai.model.bo.AgentRunStatsRowBO> selectAdminStatsRows(
            @Param("startedFrom") java.util.Date startedFrom,
            @Param("startedTo") java.util.Date startedTo);
}
