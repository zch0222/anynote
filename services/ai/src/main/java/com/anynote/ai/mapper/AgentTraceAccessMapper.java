package com.anynote.ai.mapper;

import com.anynote.ai.model.po.AgentTraceAccessPO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/**
 * Agent 运行 Trace 管理端访问留痕映射器。
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface AgentTraceAccessMapper extends BaseMapper<AgentTraceAccessPO> {
}
