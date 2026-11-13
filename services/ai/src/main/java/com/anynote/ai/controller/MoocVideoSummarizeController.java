package com.anynote.ai.controller;

import com.anynote.ai.api.model.dto.GetMoocVideoSummarizesByMoocIdDTO;
import com.anynote.ai.api.model.po.MoocVideoSummarizePO;
import com.anynote.ai.service.MoocVideoSummarizeService;
import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;
import java.util.List;

/**
 * 视频总结 Controller。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Tag(name = "视频总结", description = "AI视频内容总结接口")
@RestController
@RequestMapping("moocVideoSummarizes")
public class MoocVideoSummarizeController {

    @Resource
    private MoocVideoSummarizeService moocVideoSummarizeService;

    @InnerAuth
    @PostMapping("getMoocVideoSummarizesByMoocItemId")
    public ResData<List<MoocVideoSummarizePO>> getMoocVideoSummarizesByMoocItemId(
            @RequestHeader(SecurityConstants.FROM_SOURCE) String source,
            @RequestBody @Validated GetMoocVideoSummarizesByMoocIdDTO getMoocVideoSummarizesByMoocIdDTO) {
        log.info("getMoocVideoSummarizesByMoocItemId: {}", getMoocVideoSummarizesByMoocIdDTO.getMoocItemId());
        return ResUtil.success(moocVideoSummarizeService.list(new LambdaQueryWrapper<MoocVideoSummarizePO>()
                .eq(MoocVideoSummarizePO::getMoocItemId, getMoocVideoSummarizesByMoocIdDTO.getMoocItemId())
                .eq(MoocVideoSummarizePO::getMoocId, getMoocVideoSummarizesByMoocIdDTO.getMoocId())
                .orderBy(true, true, MoocVideoSummarizePO::getCreateTime)));
    }
}
