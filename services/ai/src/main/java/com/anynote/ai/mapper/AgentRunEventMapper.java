package com.anynote.ai.mapper;

import com.anynote.ai.model.po.AgentRunEventPO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Agent 运行事件与 Trace 映射器。
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface AgentRunEventMapper extends BaseMapper<AgentRunEventPO> {

    /**
     * 管理端按运行标识游标分页读取事件（永久保留，不提供按时间删除）。
     *
     * @param runId 运行标识
     * @param afterSeq 起始序号（不含），首页传 0
     * @param limit 单页条数
     * @return 事件列表，按 seq 升序
     */
    java.util.List<AgentRunEventPO> selectRunEvents(@Param("runId") String runId,
                                                    @Param("afterSeq") long afterSeq,
                                                    @Param("limit") int limit);
}
