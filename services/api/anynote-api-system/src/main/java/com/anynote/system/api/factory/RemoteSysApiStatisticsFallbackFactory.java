package com.anynote.system.api.factory;

import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.RemoteSysApiStatisticsService;
import com.anynote.system.api.model.dto.ApiStatisticsCreateDTO;
import com.anynote.system.api.model.dto.IncreaseApiUsageDTO;
import com.anynote.system.api.model.dto.SysApiStatisticsListDTO;
import com.anynote.system.api.model.vo.SysApiStatisticsVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Slf4j
public class RemoteSysApiStatisticsFallbackFactory implements FallbackFactory<RemoteSysApiStatisticsService> {

    @Override
    public RemoteSysApiStatisticsService create(Throwable cause) {
        return new RemoteSysApiStatisticsService() {
            @Override
            public ResData<Long> createApiStatistics(ApiStatisticsCreateDTO apiStatisticsCreateDTO) {
                return ResData.error(ResCode.INNER_SYSTEM_SERVICE_ERROR);
            }

            @Override
            public ResData<Long> createApiStatistics(ApiStatisticsCreateDTO apiStatisticsCreateDTO, String fromSource) {
                return ResData.error(ResCode.INNER_SYSTEM_SERVICE_ERROR);
            }

            @Override
            public ResData<String> increaseUsage(IncreaseApiUsageDTO increaseApiUsageDTO) {
                return ResData.error(ResCode.INNER_SYSTEM_SERVICE_ERROR);
            }

            @Override
            public ResData<String> increaseUsage(IncreaseApiUsageDTO increaseApiUsageDTO, String fromSource) {
                return ResData.error(ResCode.INNER_SYSTEM_SERVICE_ERROR);
            }


            @Override
            public ResData<List<SysApiStatisticsVO>> getSysApiStatistics(SysApiStatisticsListDTO sysApiStatisticsListDTO) {
                return ResData.error(ResCode.INNER_SYSTEM_SERVICE_ERROR);
            }
        };
    }
}
