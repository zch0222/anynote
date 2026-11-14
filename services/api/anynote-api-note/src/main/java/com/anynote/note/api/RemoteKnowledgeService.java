package com.anynote.note.api;

import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.constant.ServiceNameConstants;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.factory.RemoteKnowledgeFallbackFactory;
import com.anynote.note.api.model.dto.KnowledgeChangeRecordDTO;
import jakarta.validation.Valid;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

/**
 * 知识索引内部远程调用接口。
 *
 * @author 称霸幼儿园
 */
@FeignClient(contextId = "remoteKnowledgeService",
        value = ServiceNameConstants.NOTE_SERVICE,
        fallbackFactory = RemoteKnowledgeFallbackFactory.class)
public interface RemoteKnowledgeService {

    /**
     * 向笔记服务登记一条知识变更记录。
     *
     * @param request 变更参数
     * @param fromSource 内部调用标识
     * @return 变更游标 id
     */
    @PostMapping("/internal/v1/knowledge/changes")
    ResData<Long> recordChange(@RequestBody @Valid KnowledgeChangeRecordDTO request,
                               @RequestHeader(SecurityConstants.FROM_SOURCE) String fromSource);
}
