package com.anynote.ai.api.factory;

import com.anynote.ai.api.RemoteLlmStatisticsService;
import com.anynote.ai.api.model.dto.LlmStatisticsCreateDTO;
import com.anynote.ai.api.model.dto.LlmStatisticsQueryDTO;
import com.anynote.ai.api.model.vo.StatisticsVO;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class RemoteLlmStatisticsFallbackFactory implements FallbackFactory<RemoteLlmStatisticsService> {

    @Override
    public RemoteLlmStatisticsService create(Throwable cause) {
        return new RemoteLlmStatisticsService() {
            @Override
            public ResData<Long> createLlmStatistics(String fromSource, LlmStatisticsCreateDTO llmStatisticsCreateDTO) {
                return ResData.error(ResCode.INNER_SERVICE_ERROR);
            }

            @Override
            public ResData<List<StatisticsVO>> getLlmStatistics(String fromSource, LlmStatisticsQueryDTO llmStatisticsQueryDTO) {
                return ResData.error(ResCode.INNER_SERVICE_ERROR);
            }
        };
    }
}
