package com.anynote.ai.service.impl;

import com.anynote.ai.api.model.dto.LlmStatisticsQueryDTO;
import com.anynote.ai.api.model.po.LlmStatisticsPO;
import com.anynote.ai.api.model.vo.StatisticsVO;
import com.anynote.ai.mapper.LlmStatisticsMapper;
import com.anynote.ai.service.LlmStatisticsService;
import com.anynote.core.utils.StringUtils;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 大模型调用统计服务。
 *
 * @author 称霸幼儿园
 */
@Service
public class LlmStatisticsServiceImpl extends ServiceImpl<LlmStatisticsMapper, LlmStatisticsPO>
        implements LlmStatisticsService {

    @Override
    public void increaseUsageCount(Date startTime, Date endTime) {
        baseMapper.increaseUsageCount(startTime, endTime);
    }

    @Override
    public List<StatisticsVO> getLlmStatistics(LlmStatisticsQueryDTO llmStatisticsQueryDTO) {
        return this.baseMapper.selectList(new LambdaQueryWrapper<LlmStatisticsPO>()
                        .ge(StringUtils.isNotNull(llmStatisticsQueryDTO.getStartTime()),
                                LlmStatisticsPO::getStartTime, llmStatisticsQueryDTO.getStartTime())
                        .le(StringUtils.isNotNull(llmStatisticsQueryDTO.getEndTime()),
                                LlmStatisticsPO::getEndTime, llmStatisticsQueryDTO.getEndTime())
                        .eq(LlmStatisticsPO::getType, llmStatisticsQueryDTO.getType()))
                .stream()
                .map(llmStatisticsPO -> StatisticsVO.builder()
                        .id(llmStatisticsPO.getId())
                        .startTime(llmStatisticsPO.getStartTime())
                        .endTime(llmStatisticsPO.getEndTime())
                        .type(llmStatisticsPO.getType())
                        .usageCount(llmStatisticsPO.getUsageCount())
                        .build())
                .collect(Collectors.toList());
    }
}
