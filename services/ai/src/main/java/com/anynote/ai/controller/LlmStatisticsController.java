package com.anynote.ai.controller;

import com.anynote.ai.api.model.dto.LlmStatisticsCreateDTO;
import com.anynote.ai.api.model.dto.LlmStatisticsQueryDTO;
import com.anynote.ai.api.model.po.LlmStatisticsPO;
import com.anynote.ai.api.model.vo.StatisticsVO;
import com.anynote.ai.service.LlmStatisticsService;
import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import com.google.gson.Gson;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;
import java.util.List;

/**
 * 大模型调用统计 Controller。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Tag(name = "LLM统计", description = "LLM调用统计接口")
@RestController
@RequestMapping("llmStatistics")
public class LlmStatisticsController {

    @Resource
    private LlmStatisticsService llmStatisticsService;

    @Resource
    private Gson gson;

    @InnerAuth
    @PostMapping("")
    public ResData<Long> createLlmStatistics(@RequestHeader("from-source") String fromSource,
                                             @RequestBody @Validated LlmStatisticsCreateDTO llmStatisticsCreateDTO) {
        log.info("新建大模型调用统计: \n{}", gson.toJson(llmStatisticsCreateDTO));
        LlmStatisticsPO llmStatisticsPO = LlmStatisticsPO.builder()
                .startTime(llmStatisticsCreateDTO.getStartTime())
                .endTime(llmStatisticsCreateDTO.getEndTime())
                .type(llmStatisticsCreateDTO.getType())
                .usageCount(0)
                .deleted(0)
                .build();
        llmStatisticsService.getBaseMapper().insert(llmStatisticsPO);
        return ResUtil.success(llmStatisticsPO.getId());
    }

    /**
     * 查询调用统计
     * @param fromSource 内部调用来源
     * @param llmStatisticsQueryDTO 查询条件
     * @return 统计列表
     */
    @InnerAuth
    @GetMapping("list")
    public ResData<List<StatisticsVO>> getLlmStatistics(@RequestHeader("from-source") String fromSource,
                                                        @Validated LlmStatisticsQueryDTO llmStatisticsQueryDTO) {
        return ResUtil.success(llmStatisticsService.getLlmStatistics(llmStatisticsQueryDTO));
    }
}
