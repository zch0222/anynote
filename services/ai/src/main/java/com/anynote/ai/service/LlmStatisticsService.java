package com.anynote.ai.service;

import com.anynote.ai.api.model.dto.LlmStatisticsQueryDTO;
import com.anynote.ai.api.model.po.LlmStatisticsPO;
import com.anynote.ai.api.model.vo.StatisticsVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.Date;
import java.util.List;

/**
 * @author 称霸幼儿园
 */
public interface LlmStatisticsService extends IService<LlmStatisticsPO> {

    /**
     * 增加调用次数
     * @param startTime 开始时间
     * @param endTime 结束时间
     */
    void increaseUsageCount(Date startTime, Date endTime);

    /**
     * 查询大模型调用统计。
     *
     * @param llmStatisticsQueryDTO 查询条件
     * @return 统计列表
     */
    List<StatisticsVO> getLlmStatistics(LlmStatisticsQueryDTO llmStatisticsQueryDTO);
}
