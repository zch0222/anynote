package com.anynote.ai.mapper;

import com.anynote.ai.model.po.AgentRunEventPO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Date;

/**
 * Agent 运行事件与 Trace 映射器。
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface AgentRunEventMapper extends BaseMapper<AgentRunEventPO> {

    /**
     * 删除保留期之前的运行事件与 Trace。
     *
     * @param cutoff 保留期边界
     * @return 删除的行数
     */
    int deleteBefore(@Param("cutoff") Date cutoff);
}
