package com.anynote.note.api;

import com.anynote.core.constant.ServiceNameConstants;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.factory.RemoteKnowledgeBaseFallbackFactory;
import com.anynote.note.api.model.dto.MoocAsrInfoUpdateDTO;
import com.anynote.note.api.model.vo.MoocVideoItemInfoVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.constraints.NotNull;

@FeignClient(contextId = "remoteMoocService",
        value = ServiceNameConstants.NOTE_SERVICE,
        fallbackFactory = RemoteKnowledgeBaseFallbackFactory.class)
public interface RemoteMoocService {

    @PutMapping("moocs/asr")
    public ResData<String> updateAsrInfo(@RequestBody MoocAsrInfoUpdateDTO moocAsrInfoUpdateDTO,
                                         @RequestHeader("from-source") String fromSource);


    @GetMapping("moocs/videoItemInfo")
    public ResData<MoocVideoItemInfoVO> getMoocVideoItemInfo(@RequestParam("moocItemId") @Validated @NotNull(message = "慕课Item ID不能为空") Long moocItemId,
                                                             @RequestParam("moocId") @Validated @NotNull(message = "慕课id不能为空") Long moocId,
                                                             @RequestHeader("from-source") String fromSource,
                                                             @RequestHeader("accessToken") String accessToken);

    /**
     * 登记视频总结变更。
     *
     * @param moocItemId 慕课条目 id
     * @param fromSource 内部调用标识
     * @return 变更游标 id
     */
    @PostMapping("/internal/v1/knowledge/mooc-items/{moocItemId}/summary-changes")
    ResData<Long> recordSummaryChange(@PathVariable("moocItemId") Long moocItemId,
                                      @RequestHeader("from-source") String fromSource);
}
