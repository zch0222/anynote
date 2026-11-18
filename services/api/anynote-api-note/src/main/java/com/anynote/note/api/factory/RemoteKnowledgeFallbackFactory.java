package com.anynote.note.api.factory;

import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.RemoteKnowledgeService;
import com.anynote.note.api.model.dto.KnowledgeChangeRecordDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

/**
 * 知识索引内部远程调用降级工厂。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Component
public class RemoteKnowledgeFallbackFactory implements FallbackFactory<RemoteKnowledgeService> {

    @Override
    public RemoteKnowledgeService create(Throwable cause) {
        log.error("知识变更服务调用失败: {}", cause.getMessage());
        return new RemoteKnowledgeService() {
            @Override
            public ResData<Long> recordChange(KnowledgeChangeRecordDTO request, String fromSource) {
                return ResUtil.error(ResCode.INNER_NOTE_SERVICE_ERROR);
            }

            @Override
            public ResData<com.anynote.note.api.model.vo.KnowledgeAuthorizeBatchVO> authorizeBatch(
                    com.anynote.note.api.model.dto.KnowledgeAuthorizeBatchDTO request) {
                return ResUtil.error(ResCode.INNER_NOTE_SERVICE_ERROR);
            }
        };
    }
}
