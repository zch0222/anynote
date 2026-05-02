package com.anynote.note.controller;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.model.bo.HuaweiOBSTemporarySignature;
import com.anynote.note.model.bo.VideoQueryParam;
import com.anynote.note.model.dto.VideoListDTO;
import com.anynote.note.model.vo.VideoListVO;
import com.anynote.note.service.VideoService;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Video Controller
 * @author 称霸幼儿园
 */
@Tag(name = "视频", description = "视频资源管理接口")
@RestController
@RequestMapping("videos")
public class VideoController {

    @Resource
    private VideoService videoService;


    @GetMapping("")
    public ResData<VideoListVO> getVideoList(@Valid VideoListDTO videoListDTO) {
        return ResData.success(videoService.getVideoList(VideoQueryParam.builder()
                .folderId(videoListDTO.getFolderId())
                .knowledgeBaseId(videoListDTO.getKnowledgeBaseId())
                .build()));
    }

    @PostMapping("upload")
    public ResData<HuaweiOBSTemporarySignature> videoUploadTempLink() {
        throw new BusinessException("暂未实现", ResCode.BUSINESS_ERROR);
    }
}
